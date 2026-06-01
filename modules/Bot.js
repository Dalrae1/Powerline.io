'use strict';

const Client          = require('./Client');
const Enums           = require('./Enums');
const GlobalFunctions = require('./GlobalFunctions.js');
const MapFunctions    = require('./MapFunctions.js');

// ── utilities ─────────────────────────────────────────────────────────────────
const lerp  = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rng   = (lo, hi)  => Math.random() * (hi - lo) + lo;
const D     = Enums.Directions;

const isH     = d => d === D.LEFT  || d === D.RIGHT;
const isV     = d => d === D.UP    || d === D.DOWN;
const arePerp = (a, b) => (isH(a) && isV(b)) || (isV(a) && isH(b));
const perp    = d => isH(d) ? [D.UP, D.DOWN] : [D.LEFT, D.RIGHT];

function proj(pos, dir, dist) {
    switch (dir) {
        case D.UP:    return { x: pos.x,        y: pos.y + dist };
        case D.DOWN:  return { x: pos.x,        y: pos.y - dist };
        case D.RIGHT: return { x: pos.x + dist, y: pos.y };
        case D.LEFT:  return { x: pos.x - dist, y: pos.y };
    }
    return { x: pos.x, y: pos.y };
}

function wallDist(pos, dir, half) {
    switch (dir) {
        case D.UP:    return half - pos.y;
        case D.DOWN:  return half + pos.y;
        case D.RIGHT: return half - pos.x;
        case D.LEFT:  return half + pos.x;
    }
    return Infinity;
}

const CW  = { [D.RIGHT]: D.DOWN,  [D.DOWN]: D.LEFT,  [D.LEFT]: D.UP,   [D.UP]: D.RIGHT };
const CCW = { [D.RIGHT]: D.UP,    [D.UP]:   D.LEFT,   [D.LEFT]: D.DOWN, [D.DOWN]: D.RIGHT };

const CLEARANCE     = 2.2;
const GAP_CLEARANCE = 0.9;
// Minimum distance traveled since last turn before another turn is allowed.
// Critical: prevents hairpin self-kills from rapid sequential turns.
const MIN_TURN_DIST  = 4.5;
const MIN_FORCE_DIST = 2.2;

// ── Seeded PRNG (xorshift32) ───────────────────────────────────────────────────
class Rng {
    constructor(seed) { this._s = (seed >>> 0) || 1; }
    next() {
        this._s ^= this._s << 13;
        this._s ^= this._s >>> 17;
        this._s ^= this._s << 5;
        return (this._s >>> 0) / 0xFFFFFFFF;
    }
    int(lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); }
    pick(arr)   { return arr[Math.floor(this.next() * arr.length)]; }
}

// ── Name generation ───────────────────────────────────────────────────────────
const ADJ = [
    'Dark','Swift','Iron','Storm','Fire','Ice','Shadow','Thunder','Neon','Cyber',
    'Ultra','Mega','Hyper','Turbo','Ninja','Stealth','Blaze','Frost','Chaos','Void',
    'Ghost','Phantom','Razor','Venom','Toxic','Pixel','Quantum','Rogue','Prime','Alpha',
    'Omega','Savage','Grim','Wild','Blazing','Electric','Sonic','Crimson','Obsidian','Azure',
    'Jade','Amber','Ivory','Onyx','Silver','Golden','Bronze','Scarlet','Cobalt','Emerald',
];
const NOUN = [
    'Fang','Claw','Strike','Blade','Coil','Spike','Scale','Viper','Cobra','Mamba',
    'Python','Adder','Wyrm','Drake','Reaper','Stalker','Wraith','Specter','Hunter','Slayer',
    'Crusher','King','Master','Elite','Boss','Legend','Fury','Apex','Nexus','Vector',
    'Cipher','Helix','Core','Force','Rex','Bane','Frenzy','Surge','Pulse','Blitz',
    'Torrent','Cascade','Vortex','Eclipse','Nova','Zenith','Nadir','Abyss','Tempest','Gale',
];

function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h  = Math.imul(h, 16777619) >>> 0;
    }
    return h;
}

function makeBotName(seed) {
    const r   = new Rng(seed);
    const adj = ADJ[Math.floor(r.next() * ADJ.length)];
    const n   = NOUN[Math.floor(r.next() * NOUN.length)];
    const num = Math.floor(r.next() * 99) + 1;
    return `BOT_${adj}${n}${num}`;
}

// ── Skill system ──────────────────────────────────────────────────────────────
//
//  28 individual skills, each 0-1, deterministically derived from the bot's
//  name hash.  Same name → same skills on every server.
//
const SKILL_KEYS = [
    // MOVEMENT & AWARENESS
    'reactionSpeed',      // update interval (0=slow, 1=fast)
    'lookaheadSkill',     // obstacle scan range
    'dangerSensitivity',  // how large danger_dist is
    'gapBravery',         // clearance tolerance for tight gaps
    'centerAffinity',     // strength of centre-pull during roam
    'openSpaceValue',     // preference for open directions when roaming
    'wallWarning',        // how early to start steering away from walls

    // AGGRESSION & COMBAT
    'aggressionLevel',    // overall desire to hunt
    'killInstinct',       // urgency of executing kills when in position
    'interceptPrecision', // timing tolerance for block attempts
    'setupMobility',      // willingness to reposition for a better kill angle
    'targetSizePref',     // 0 = prefer small targets, 1 = prefer large
    'huntPersistence',    // how long to stick to same target before switching
    'ambushTendency',     // prefers waiting in position vs chasing

    // SPEED & RUBBING
    'rubAttrition',       // how aggressively it seeks rub speed
    'rubSpeedThreshold',  // how much speed before committing to kill execution
    'comboAwareness',     // maintains eat-combo for speed
    'foodLookAhead',      // distance to look ahead for food chains
    'speedGreed',         // prioritises speed gain over other actions

    // SURVIVAL & ESCAPE
    'selfPreservation',   // weight given to safety vs aggression
    'panicThreshold',     // how enclosed before entering escape mode
    'escapeInstinct',     // pre-emptive escape sensitivity
    'bodyAwareness',      // how carefully it avoids own body

    // GROWTH & FOOD
    'foodGreed',          // aggressiveness of food seeking
    'postKillCollection', // does it collect food dropped by kills?

    // COIL
    'coilTrigger',        // size required before coiling
    'coilTightness',      // arm length of coil (0=tight, 1=loose)
    'coilHuntExit',       // exits coil to hunt when opportunity arises
];

function skillsFromName(name) {
    const r  = new Rng(hashStr(name));
    const sk = {};
    for (const key of SKILL_KEYS) sk[key] = r.next();
    return sk;
}

// Derive a personality string that affects how skill weights are applied.
function personalityFromSkills(sk) {
    if (sk.aggressionLevel > 0.78 && sk.selfPreservation < 0.28) return 'BERSERKER';
    if (sk.foodGreed > 0.78 && sk.aggressionLevel < 0.32)        return 'FARMER';
    if (sk.coilTrigger > 0.72 && sk.selfPreservation > 0.68)     return 'DEFENDER';
    if (sk.rubAttrition > 0.72 && sk.speedGreed > 0.68)          return 'SPEEDSTER';
    if (sk.interceptPrecision > 0.74 && sk.ambushTendency > 0.7) return 'TACTICIAN';
    if (sk.selfPreservation > 0.78 && sk.panicThreshold > 0.68)  return 'SURVIVOR';
    if (sk.killInstinct > 0.76 && sk.setupMobility > 0.68)       return 'PREDATOR';
    if (sk.rubAttrition > 0.65 && sk.comboAwareness > 0.65)      return 'SPEEDFARMER';
    const extremes = SKILL_KEYS.filter(k => sk[k] > 0.82 || sk[k] < 0.18).length;
    if (extremes >= 9) return 'WILDCARD';
    return 'OPPORTUNIST';
}

// ─────────────────────────────────────────────────────────────────────────────

class Bot {
    constructor(server) {
        this.server = server;

        // ── Unique seeded name ────────────────────────────────────────────────
        // Each bot gets a FULLY RANDOM seed so names are diverse across the
        // whole name space (50 adj × 50 noun × 99 numbers = 247 500 combos).
        // Sequential seeds from an incrementing counter produced near-identical
        // xorshift outputs whose first call always landed on ADJ[0] = 'Dark'.
        if (!server._usedBotNames) server._usedBotNames = new Set();

        let name;
        let attempts = 0;
        do {
            // Mix multiple entropy sources so even rapid-fire construction
            // produces well-spread seeds.
            const seed = ((Math.random() * 0xFFFFFFFF) ^ (Date.now() << 5) ^ (attempts * 0x9E3779B9)) >>> 0;
            name = makeBotName(seed);
            attempts++;
        } while (server._usedBotNames.has(name) && attempts < 500);
        server._usedBotNames.add(name);
        this.nickname = name;

        // ── Skills & personality ──────────────────────────────────────────────
        this.sk          = skillsFromName(this.nickname);
        this.personality = personalityFromSkills(this.sk);
        const p = this.personality;

        // ── Derived operational attributes ───────────────────────────────────
        this.lookAhead    = lerp(16, 78, this.sk.lookaheadSkill);
        this.dangerDist   = lerp(6,  28, this.sk.dangerSensitivity);
        this._intervalMs  = Math.round(lerp(195, 22, this.sk.reactionSpeed));
        this._minTurnMs   = Math.round(lerp(135, 45, this.sk.reactionSpeed));
        this.missChance   = lerp(0.30, 0.00, this.sk.reactionSpeed);

        // Personality modifiers
        if (p === 'BERSERKER')   { this.sk.aggressionLevel = Math.min(1, this.sk.aggressionLevel * 1.3); }
        if (p === 'SPEEDSTER')   { this.sk.rubAttrition    = Math.min(1, this.sk.rubAttrition    * 1.3); }
        if (p === 'FARMER')      { this.sk.foodGreed       = Math.min(1, this.sk.foodGreed       * 1.3); }
        if (p === 'SURVIVOR')    { this.dangerDist *= 1.25; }

        // ── Mission state machine ─────────────────────────────────────────────
        // Missions (in priority order):
        //   ESCAPE, EXECUTE_KILL, SPEED_KILL, MAINTAIN_RUB,
        //   HUNT_KILL, FOOD_TRAIL, FOOD_CHAIN, COIL, ROAM
        this._mission        = 'ROAM';
        this._lastTurnAt     = 0;
        this._lastTurnPos    = { x: 0, y: 0 };

        // ── Targeting ─────────────────────────────────────────────────────────
        this._killTarget     = null;   // snake we are hunting
        this._lastTargetSwap = 0;      // when we last switched kill targets
        this._rubSegment     = null;   // { hit, approachPos, approachDist, segDir, length }

        // ── Coil ──────────────────────────────────────────────────────────────
        this._coilActive     = false;
        this._coilCW         = true;
        this._coilArm        = 0;
        this._coilLastPos    = null;
        this._coilMinLen     = lerp(420, 160, this.sk.coilTrigger);
        this._postCoilUntil  = 0;

        // ── Lifecycle ─────────────────────────────────────────────────────────
        this.client   = this._initClient(server);
        this._interval  = null;
        this._idleTimer = null;

        this.enterGame();
        this._interval = setInterval(() => this._tick(), this._intervalMs);
        if (this.sk.reactionSpeed < 0.5) this._scheduleIdleTurn();
    }

    destroy() {
        clearInterval(this._interval);
        clearTimeout(this._idleTimer);
        this._interval = this._idleTimer = null;
        this.server._usedBotNames?.delete(this.nickname);
    }

    _initClient(server) {
        const c = new Client(server, { send: () => {} }, null);
        c.isBot = true;
        return c;
    }

    enterGame() {
        try {
            const buf = new ArrayBuffer(1 + (1 + this.nickname.length) * 2);
            const dv  = new DataView(buf);
            GlobalFunctions.SetNick(dv, 1, this.nickname);
            this.client.RecieveMessage(Enums.ClientToServer.OPCODE_ENTER_GAME, dv);
        } catch (_) {}
    }

    // ── Main tick ─────────────────────────────────────────────────────────────

    _tick() {
        const snake = this.client.snake;
        if (!snake || !snake.spawned) { this.enterGame(); return; }
        if (Math.random() < this.missChance * 0.18) return;

        if (this._coilActive) { this._tickCoil(snake); return; }

        // ── Compute world state once per tick ─────────────────────────────────
        const W = this._buildWorld(snake);

        // ── Priority 0: Escape (always overrides) ────────────────────────────
        if (W.clearFwd < this.dangerDist) {
            if (W.maxClear < this.dangerDist * lerp(2.0, 3.8, this.sk.panicThreshold)) {
                this._mission = 'ESCAPE';
                this._tickEscape(snake, W);
            } else {
                this._evade(snake, W);
            }
            return;
        }
        // Pre-emptive escape: all routes shrinking
        if (W.maxClear < this.dangerDist * lerp(2.8, 5.5, this.sk.escapeInstinct)) {
            this._mission = 'ESCAPE';
            this._tickEscape(snake, W);
            return;
        }

        // ── Select and execute mission ────────────────────────────────────────
        this._mission = this._selectMission(snake, W);

        switch (this._mission) {
            case 'EXECUTE_KILL':  this._tickExecuteKill(snake, W);  break;
            case 'SPEED_KILL':    this._tickSpeedKill(snake, W);     break;
            case 'MAINTAIN_RUB':  this._tickMaintainRub(snake, W);  break;
            case 'HUNT_KILL':     this._tickHuntKill(snake, W);      break;
            case 'FOOD_TRAIL':    this._tickFoodTrail(snake, W);     break;
            case 'FOOD_CHAIN':    this._tickFoodChain(snake, W);     break;
            case 'COIL':          this._enterCoil(snake);            break;
            default:              this._tickRoam(snake, W);          break;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  WORLD STATE — computed once per tick, passed to all execution methods
    // ─────────────────────────────────────────────────────────────────────────

    _buildWorld(snake) {
        const [pA, pB]  = perp(snake.direction);
        const clearFwd  = this._pathClear(snake, snake.direction);
        const clearA    = this._pathClear(snake, pA);
        const clearB    = this._pathClear(snake, pB);
        const maxClear  = Math.max(clearFwd, clearA, clearB);

        const isRubbing = !!(snake.flags & Enums.EntityFlags.IS_RUBBING);
        const extraSpeed = snake.extraSpeed || 0;
        const eatCombo   = snake.eatCombo   || 0;

        // Food density in each direction
        const fdFwd = this._foodDensity(snake, snake.direction);
        const fdA   = this._foodDensity(snake, pA);
        const fdB   = this._foodDensity(snake, pB);

        // Kill / rub targets
        const killTarget = this._selectKillTarget(snake);
        const rubTarget  = this._findBestRubTarget(snake);
        const rubInfo    = rubTarget ? this._computeRubApproach(snake, rubTarget) : null;

        // Food trail: narrow corridor with 5+ items in any direction (from kills)
        const foodTrailDir = this._detectFoodTrail(snake);

        return {
            pA, pB, clearFwd, clearA, clearB, maxClear,
            isRubbing, extraSpeed, eatCombo,
            fdFwd, fdA, fdB,
            killTarget, rubTarget, rubInfo,
            foodTrailDir,
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  MISSION SELECTION
    //
    //  Priority ladder (highest to lowest):
    //    1. EXECUTE_KILL   — currently rubbing + have speed + in position
    //    2. MAINTAIN_RUB   — currently rubbing, building speed
    //    3. SPEED_KILL     — have speed, not rubbing, find cut-off
    //    4. HUNT_KILL      — committed to one target: approach → rub → kill
    //    5. FOOD_TRAIL     — dense food trail detected (recent kill nearby)
    //    6. FOOD_CHAIN     — moderate food density, maintain combo speed
    //    7. COIL           — large snake, defensive
    //    8. ROAM           — default
    //
    //  HUNT_KILL is the primary offensive state.  When the bot sees a snake it
    //  probabilistically decides to commit to killing it, then follows that
    //  target: approach their body, get alongside, build rub speed, and cut off
    //  when past the head.
    // ─────────────────────────────────────────────────────────────────────────

    _selectMission(snake, W) {
        const { isRubbing, extraSpeed, killTarget, rubInfo,
                fdFwd, fdA, fdB, clearFwd, clearA, clearB, pA, pB,
                foodTrailDir } = W;

        const speedThreshold = lerp(14, 4, this.sk.rubSpeedThreshold);

        // ── 1. Currently rubbing ───────────────────────────────────────────────
        if (isRubbing) {
            // If we have enough speed AND a kill target is available, execute.
            if (extraSpeed >= speedThreshold && killTarget) return 'EXECUTE_KILL';
            return 'MAINTAIN_RUB';
        }

        // ── 2. Have speed — execute a kill now ────────────────────────────────
        if (extraSpeed >= speedThreshold && killTarget) return 'SPEED_KILL';

        // ── 3. HUNT_KILL — committed kill pursuit ─────────────────────────────
        // If we already have a committed target, stay on it (persistence).
        // Otherwise, probabilistically decide to start a hunt when we see a snake.
        if (this._killTarget?.spawned && this.client.loadedEntities[this._killTarget.id]) {
            return 'HUNT_KILL';
        }

        // Consider starting a new hunt: probability based on aggression, kill
        // instinct, and how close the nearest snake is.
        if (killTarget) {
            const dist       = MapFunctions.GetDistance(snake.position, killTarget.position);
            const nearFactor = Math.max(0, 1 - dist / 150);
            const huntProb   = this.sk.aggressionLevel
                             * lerp(0.25, 0.95, this.sk.killInstinct)
                             * (1 + nearFactor * 0.6);
            if (Math.random() < huntProb) {
                this._killTarget = killTarget;
                this._lastTargetSwap = Date.now();
                return 'HUNT_KILL';
            }
        }

        // ── 4. Food trail — recent kill created a dense food line ────────────
        // Check ALL 4 directions (not just perpendicular) so the bot can turn
        // back toward food behind it if necessary, as long as it's safe.
        if (foodTrailDir) {
            const trailClear = foodTrailDir === pA ? clearA
                             : foodTrailDir === pB ? clearB
                             : clearFwd; // forward
            if (trailClear >= this.dangerDist * 0.90 || foodTrailDir === snake.direction)
                return 'FOOD_TRAIL';
        }

        // ── 5. Food chain — moderate food density ────────────────────────────
        const comboBoost = W.eatCombo >= 3 ? lerp(1.5, 3.0, this.sk.comboAwareness) : 1.0;
        const maxFd = Math.max(fdFwd, fdA, fdB) * comboBoost;
        if (maxFd >= lerp(1.8, 0.8, this.sk.foodGreed)) return 'FOOD_CHAIN';

        // ── 6. Coil ───────────────────────────────────────────────────────────
        if (snake.visualLength >= this._coilMinLen &&
            Math.random() < 0.014 * this.sk.coilTrigger &&
            clearFwd > 55 && this._nearestThreatDist(snake) > this.lookAhead * 1.5)
            return 'COIL';

        return 'ROAM';
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  KILL TARGETING
    //
    //  Scores every loaded player by kill potential and selects the best.
    //  Considers: proximity, direction geometry, speed differential, wall
    //  proximity, body length (rub potential), and skill-based preferences.
    //  Persistence: won't switch target for `huntPersistence` seconds.
    // ─────────────────────────────────────────────────────────────────────────

    _selectKillTarget(snake) {
        const now  = Date.now();
        const hold = lerp(800, 2800, this.sk.huntPersistence);

        // Keep existing target if it's still valid and within persistence window
        if (this._killTarget?.spawned &&
            this.client.loadedEntities[this._killTarget.id] &&
            now - this._lastTargetSwap < hold)
            return this._killTarget;

        const sp   = snake.position;
        const sd   = snake.direction;
        const half = this.server.config.ArenaSize / 2;
        let   best = null, bestScore = -Infinity;

        for (const e of Object.values(this.client.loadedEntities)) {
            if (e.type !== Enums.EntityTypes.ENTITY_PLAYER || e === snake) continue;

            const dist = MapFunctions.GetDistance(sp, e.position);
            if (dist > 220) continue; // beyond full streaming range

            let score = 100;

            // Proximity (closer = better kill opportunity)
            score -= dist * 0.28;

            // Direction geometry
            if (arePerp(sd, e.direction))    score += 40; // perpendicular = easiest intercept
            else if (sd === e.direction)     score += 22; // same direction = tail-follow/rub
            // opposite direction: no bonus (head-on is risky)

            // Speed advantage (we want to be faster)
            const speedAdv = (snake.extraSpeed || 0) - (e.extraSpeed || 0);
            score += speedAdv * 5;

            // Wall proximity of TARGET (targets near walls have less escape room)
            const targetWallDist = Math.min(
                half - Math.abs(e.position.x),
                half - Math.abs(e.position.y)
            );
            score += Math.max(0, 35 - targetWallDist) * 0.8;

            // Body length (longer = more rub surface)
            if (e.visualLength > 120) score += 18;
            if (e.visualLength > 300) score += 12;

            // Size preference skill
            if (this.sk.targetSizePref < 0.4) {
                // Prefer smaller targets
                score += Math.max(0, snake.visualLength - e.visualLength) * 0.015;
            } else if (this.sk.targetSizePref > 0.65) {
                // Prefer larger targets (more food on kill)
                score += Math.min(40, e.visualLength * 0.04);
            }

            // Intercept quality: if a clean intercept exists, big bonus
            const ic = this._interceptCalc(sp, sd, e.position, e.direction);
            if (ic && ic.botDist <= ic.targetDist * 1.0) score += 30;

            if (score > bestScore) { bestScore = score; best = e; }
        }

        if (best !== this._killTarget) this._lastTargetSwap = now;
        this._killTarget = best;
        return best;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  RUB SEGMENT SELECTION
    //
    //  Scans all segments within reach and finds the best one to rub against.
    //  "Best" considers: segment length (rub time), direction match (can we
    //  align?), proximity of the approach position, and whether rubbing it
    //  would put us near the target's head (for kill timing).
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Find the best snake to rub against.
     *
     * Rubbing is the primary speed-building mechanic.  The ideal rub target
     * is a snake that:
     *  - Is nearby (lower approach cost)
     *  - Is moving in the same or matchable direction (easier to align)
     *  - Has a long body (more rubbing time before we outrun them)
     *  - Is moving in an open area (so we have room to keep pace)
     *
     * Returns the snake entity or null.
     */
    _findBestRubTarget(snake) {
        const sp  = snake.position;
        const sd  = snake.direction;
        const scanR = lerp(80, 160, this.sk.rubAttrition);
        let   best = null, bestScore = -Infinity;

        for (const e of Object.values(this.client.loadedEntities)) {
            if (e.type !== Enums.EntityTypes.ENTITY_PLAYER || e === snake) continue;

            const dist = MapFunctions.GetDistance(sp, e.position);
            if (dist > scanR) continue;

            const td = e.direction;

            // Direction compatibility — same direction = just slide in alongside
            let dirScore = 0;
            if (td === sd)              dirScore = 40; // easiest: already parallel
            else if (arePerp(td, sd))   dirScore = 22; // one turn to align
            else                         dirScore = 5;  // opposite: possible but harder

            // Proximity
            const distScore = -dist * 0.32;

            // Body length: longer snake = longer rub session
            const lenScore = Math.min(35, e.visualLength * 0.05);

            // Bonus for being the kill target (rub + kill in one motion)
            const killBonus = e === this._killTarget ? 25 : 0;

            const score = dirScore + distScore + lenScore + killBonus;
            if (score > bestScore) { bestScore = score; best = e; }
        }
        return best;
    }

    /**
     * Compute the rub approach info for a target snake.
     *
     * The approach position is 3 units PERPENDICULAR to the target's direction,
     * placed a few units BEHIND their head.  This puts us alongside their head
     * segment (position → points[0]) which is always present and rubble.
     *
     * Returns { approachPos, approachDist, rubDir, lateralOffset }
     */
    _computeRubApproach(snake, target) {
        const sp = snake.position;
        const tp = target.position;
        const td = target.direction;
        const RUB_OFFSET  = 2;   // lateral distance from target's path (matches _tickApproachRub)
        const BEHIND_DIST = 6;   // how far behind target's head to aim for

        // Position behind the target's head in their movement direction
        const behind = proj(tp, td, -BEHIND_DIST); // step backward = behind head

        // Choose which SIDE to approach from (the closer side to us)
        let approachPos;
        if (isH(td)) {
            // Target moving LEFT/RIGHT — rub above or below
            const side = sp.y >= tp.y ? 1 : -1;
            approachPos = { x: behind.x, y: tp.y + side * RUB_OFFSET };
        } else {
            // Target moving UP/DOWN — rub left or right
            const side = sp.x >= tp.x ? 1 : -1;
            approachPos = { x: tp.x + side * RUB_OFFSET, y: behind.y };
        }

        const approachDist = MapFunctions.GetDistance(sp, approachPos);
        return { target, approachPos, approachDist, rubDir: td };
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EXECUTE KILL — already at the blocking position, make the turn
    // ─────────────────────────────────────────────────────────────────────────

    _tickExecuteKill(snake, W) {
        const { killTarget, pA, pB, clearA, clearB } = W;
        if (!killTarget?.spawned) { this._mission = 'ROAM'; return; }

        const sp = snake.position;
        const sd = snake.direction;
        const tp = killTarget.position;

        // Choose which perpendicular direction places our body ACROSS their path
        // (i.e. toward the side the target is approaching from)
        let blockDir;
        if (isH(sd)) {
            blockDir = tp.y > sp.y ? D.UP : D.DOWN;
        } else {
            blockDir = tp.x > sp.x ? D.RIGHT : D.LEFT;
        }

        const chosenClear = blockDir === pA ? clearA : clearB;
        const otherDir    = blockDir === pA ? pB : pA;
        const otherClear  = blockDir === pA ? clearB : clearA;

        if (chosenClear >= this.dangerDist * 0.7) {
            this._turn(snake, blockDir);
        } else if (otherClear >= this.dangerDist * 0.7) {
            this._turn(snake, otherDir);
        }
        // Either way, mark as done so we don't loop
        this._mission = 'ROAM';
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  SPEED KILL — have high extraSpeed, find nearest kill position and execute
    // ─────────────────────────────────────────────────────────────────────────

    _tickSpeedKill(snake, W) {
        const { killTarget, clearFwd, clearA, clearB, pA, pB, extraSpeed } = W;
        if (!killTarget?.spawned) { this._mission = 'HUNT'; return; }

        const sp = snake.position;
        const sd = snake.direction;
        const tp = killTarget.position;
        const td = killTarget.direction;

        // With speed, accept worse intercept timings (we'll arrive before they react)
        const speedFactor = 1 + extraSpeed * 0.025;

        // Try current direction intercept first
        if (arePerp(sd, td)) {
            const ic = this._interceptCalc(sp, sd, tp, td);
            if (ic && ic.botDist <= ic.targetDist * lerp(0.65, 1.20, this.sk.interceptPrecision) * speedFactor) {
                const offset = lerp(4, 1.0, this.sk.interceptPrecision);
                const arrived = isH(sd)
                    ? (sd === D.RIGHT ? sp.x >= ic.ix + offset : sp.x <= ic.ix - offset)
                    : (sd === D.UP    ? sp.y >= ic.iy + offset : sp.y <= ic.iy - offset);

                if (arrived && ic.targetDist > 1.5) {
                    this._tickExecuteKill(snake, W);
                    return;
                }
                return; // keep heading toward kill position
            }
        }

        // Try turning to create an intercept with speed bonus
        for (const [dir, clear] of [[pA, clearA], [pB, clearB]]) {
            if (clear < this.dangerDist) continue;
            const ic = this._interceptCalc(sp, dir, tp, td);
            if (ic && ic.botDist <= ic.targetDist * lerp(0.70, 1.15, this.sk.interceptPrecision) * speedFactor) {
                this._turn(snake, dir);
                return;
            }
        }

        // No clean intercept yet — commit to hunt kill cycle using accumulated speed
        if (W.killTarget && !this._killTarget) this._killTarget = W.killTarget;
        this._tickHuntKill(snake, W);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  MAINTAIN RUB — currently rubbing, stay on course, watch for kill moment
    // ─────────────────────────────────────────────────────────────────────────

    _tickMaintainRub(snake, W) {
        // DO NOT TURN — any turn immediately ends the rub.
        // Watch for the kill window: when speed is high AND we've run past
        // the rubbed snake's head, turn to lay body across their path.

        const { extraSpeed, pA, pB, clearA, clearB } = W;

        // Use the server-authoritative RubSnake reference — this is exactly
        // the snake whose body we're touching, not a guessed kill target.
        const rubAgainst = snake.RubSnake;
        if (!rubAgainst?.spawned) return;

        const sp        = snake.position;
        const tp        = rubAgainst.position;
        const threshold = lerp(14, 4, this.sk.rubSpeedThreshold);

        // Keep rubbing until minimum useful speed is built.
        if (extraSpeed < threshold * 0.50) return;

        // Are we ahead of the rubbed snake's head in our direction of travel?
        // "Ahead" means our head has passed theirs, so turning now lays a
        // wall directly in front of them.
        const aheadMargin = lerp(10, 4, this.sk.rubAttrition);
        const isAhead = isH(snake.direction)
            ? (snake.direction === D.RIGHT ? sp.x > tp.x + aheadMargin
                                           : sp.x < tp.x - aheadMargin)
            : (snake.direction === D.UP    ? sp.y > tp.y + aheadMargin
                                           : sp.y < tp.y - aheadMargin);

        if (!isAhead) return; // not past their head yet — keep rubbing

        // Execute the kill cut.
        const sA = clearA + this._centerBonus(snake, pA);
        const sB = clearB + this._centerBonus(snake, pB);
        if (Math.max(clearA, clearB) >= this.dangerDist * 0.65) {
            this._turn(snake, sA >= sB ? pA : pB);
            this._killTarget = null;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  HUNT_KILL — committed single-target kill cycle
    //
    //  When the bot decides to hunt a specific snake it commits fully:
    //    PHASE 1 APPROACH: Navigate to the rub lane (2 units lateral)
    //    PHASE 2 RUB:      Travel parallel in the lane, building speed
    //    PHASE 3 EXECUTE:  When past the target's head by killThreshold units
    //                      AND have speed, turn TOWARD target to block
    //
    //  Anti-escape: turning TOWARD the target (not away) means the bot's body
    //  extends across the target's path on the side the target might escape to.
    //  If the target turns toward the bot, they immediately hit the bot's body
    //  (since the bot's horizontal trail is right there in their lane).
    //
    //  If the target changes direction mid-hunt the bot resets: it clears
    //  _killTarget and the next tick _selectMission will probabilistically
    //  re-commit (possibly to the same snake, now at a new angle).
    // ─────────────────────────────────────────────────────────────────────────

    _tickHuntKill(snake, W) {
        const target = this._killTarget;
        if (!target?.spawned || !this.client.loadedEntities[target.id]) {
            this._killTarget = null; this._mission = 'ROAM'; return;
        }

        const { pA, pB, clearA, clearB } = W;
        const sp = snake.position;
        const tp = target.position;
        const td = target.direction;
        const sd = snake.direction;

        // ── Lane geometry ──────────────────────────────────────────────────────
        const RUB_OFFSET  = 2;
        const laneIsY     = isH(td);
        const side        = laneIsY
            ? (sp.y >= tp.y ? 1 : -1)
            : (sp.x >= tp.x ? 1 : -1);
        const laneCoord    = laneIsY ? tp.y + side * RUB_OFFSET : tp.x + side * RUB_OFFSET;
        const currentCoord = laneIsY ? sp.y : sp.x;
        const laneOffset   = Math.abs(currentCoord - laneCoord);

        // "In lane" means: within lateral range AND moving parallel to target
        const IN_LANE_THRESH = 3;
        const inLane = laneOffset <= IN_LANE_THRESH && sd === td;

        // ── Head advantage: how far past the target's head we are ─────────────
        // Positive = we're ahead (good for cut-off), negative = we're behind
        let headAdv;
        if (isH(td)) {
            headAdv = td === D.RIGHT ? sp.x - tp.x : tp.x - sp.x;
        } else {
            headAdv = td === D.UP ? sp.y - tp.y : tp.y - sp.y;
        }

        // ── PHASE 3 EXECUTE ────────────────────────────────────────────────────
        // We're in the lane, well past the head, and have usable speed.
        // Turn TOWARD the target: this places a body segment across their path.
        //   If target is above (side=+1, laneIsY=true): we turn DOWN (toward them)
        //   If target is below (side=-1):               we turn UP
        // The body segment we've been laying in the lane now forms an L-wall.
        const killThreshold = lerp(10, 4, this.sk.interceptPrecision);
        const hasKillSpeed  = W.extraSpeed >= lerp(8, 2, this.sk.rubSpeedThreshold)
                           || !!(snake.flags & Enums.EntityFlags.IS_RUBBING);

        if (inLane && headAdv >= killThreshold && hasKillSpeed) {
            const blockDir = laneIsY
                ? (side > 0 ? D.DOWN : D.UP)
                : (side > 0 ? D.LEFT : D.RIGHT);
            const bClear = blockDir === pA ? clearA : clearB;
            const oClear = (blockDir === pA ? clearB : clearA);
            const other  = blockDir === pA ? pB : pA;

            if (bClear >= this.dangerDist * 0.60) {
                this._turn(snake, blockDir, false);
            } else if (oClear >= this.dangerDist * 0.60) {
                this._turn(snake, other, false);
            }
            this._killTarget = null;
            return;
        }

        // ── Target changed direction mid-hunt — reset ─────────────────────────
        // The target turned.  Clear the commit; next _selectMission call will
        // re-evaluate (may immediately re-commit with new geometry).
        if (inLane && target.direction !== td) {
            this._killTarget = null; return;
        }

        // ── PHASE 2 RUB: in lane, keep going straight to build speed ──────────
        // Never turn while in the lane — turning ends rubbing.
        // The server detects rubbing automatically when our head is ≤4 units from
        // the body segment, which it will be since we're in the rub lane.
        if (inLane) {
            // Overshoot guard: if we've gone 50+ units past head with no kill,
            // the target changed course. Reset.
            if (headAdv > 50) { this._killTarget = null; }
            return; // stay in lane
        }

        // ── PHASE 1 APPROACH: navigate into the rub lane ──────────────────────
        // Identical lane-navigation logic to _tickApproachRub.
        const LANE_THRESH = 2;
        if (laneOffset <= LANE_THRESH) {
            // Laterally aligned — turn to match td
            if (sd !== td) {
                if (arePerp(sd, td)) {
                    const c = td === pA ? clearA : clearB;
                    if (c >= this.dangerDist * 0.80) { this._turn(snake, td); return; }
                } else {
                    const sA = clearA, sB = clearB;
                    if (Math.max(sA, sB) >= this.dangerDist * 0.80)
                        this._turn(snake, sA >= sB ? pA : pB);
                }
            }
            return;
        }

        const laneDir = laneIsY
            ? (sp.y < laneCoord ? D.UP   : D.DOWN)
            : (sp.x < laneCoord ? D.RIGHT : D.LEFT);

        if (sd === laneDir) { return; } // already heading toward lane

        if (arePerp(sd, laneDir)) {
            const c = laneDir === pA ? clearA : clearB;
            if (c >= this.dangerDist * 0.85) { this._turn(snake, laneDir); }
            else {
                if (arePerp(sd, td)) {
                    const tc = td === pA ? clearA : clearB;
                    if (tc >= this.dangerDist) this._turn(snake, td);
                }
            }
        } else {
            // Moving away from lane — turn 90° first
            if (arePerp(sd, td)) {
                const tc = td === pA ? clearA : clearB;
                if (tc >= this.dangerDist * 0.85) { this._turn(snake, td); return; }
            }
            const sA = clearA, sB = clearB;
            if (Math.max(sA, sB) >= this.dangerDist * 0.80)
                this._turn(snake, sA >= sB ? pA : pB);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  FOOD TRAIL — follow a dense line of food (typically from a recent kill)
    //
    //  When a snake dies it drops many food items along its body path, creating
    //  a "trail".  The bot detects this as a narrow corridor with ≥5 items and
    //  turns to follow it, collecting as many items as possible.
    // ─────────────────────────────────────────────────────────────────────────

    _tickFoodTrail(snake, W) {
        const { pA, pB, clearA, clearB, foodTrailDir } = W;
        if (!foodTrailDir) { this._mission = 'ROAM'; return; }

        if (foodTrailDir === snake.direction) return; // already heading down trail

        // Turn toward the trail if the path is safe
        const tClear = foodTrailDir === pA ? clearA
                     : foodTrailDir === pB ? clearB
                     : this._pathClear(snake, foodTrailDir); // opposite direction
        if (tClear >= this.dangerDist * 0.90) {
            this._turn(snake, foodTrailDir);
        } else {
            // Trail in an unsafe direction — just take the safer perpendicular
            // toward higher food density
            const bestPerp = (W.fdA >= W.fdB ? pA : pB);
            const bClear   = bestPerp === pA ? clearA : clearB;
            if (bClear >= this.dangerDist) this._turn(snake, bestPerp);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  APPROACH RUB — navigate into the rub lane beside the target snake
    //
    //  The rub lane is a coordinate 3 units lateral from the target's path.
    //  Once in the lane the server auto-detects rubbing (head within 4 units
    //  of any body segment).  The body segment behind the head can be very
    //  long, so the bot doesn't need to be at a specific X (or Y) along the
    //  lane — just in it.
    //
    //  Navigation uses a two-phase strategy:
    //    Phase 1: turn to close the lateral gap (get into the lane).
    //    Phase 2: when in lane, turn to match the target's direction.
    //
    //  All direction cases are handled explicitly so the bot never stalls.
    // ─────────────────────────────────────────────────────────────────────────

    _tickApproachRub(snake, W) {
        const { rubInfo, pA, pB, clearA, clearB } = W;
        if (!rubInfo) { this._mission = 'ROAM'; return; }

        const { target, rubDir } = rubInfo;
        if (!target?.spawned || !this.client.loadedEntities[target.id]) {
            this._mission = 'ROAM'; return;
        }

        const sp = snake.position;
        const tp = target.position;
        const sd = snake.direction;
        // RUB_OFFSET: how far lateral from target's body we aim to travel.
        // The server detects rubbing at distance < 4.  Using offset 2 means
        // the bot's path is 2 units from the body — well inside rub range.
        const RUB_OFFSET  = 2;
        // LANE_THRESH: enter Phase 2 (align direction) when within this many
        // units of laneCoord.  With offset=2 and rub threshold 4, being within
        // 2 units of laneCoord places us within 4 units of the actual body.
        const LANE_THRESH = 2;

        // ── Compute the lane coordinate ────────────────────────────────────────
        // H target: the lane is a specific Y value (tp.y ± RUB_OFFSET).
        // V target: the lane is a specific X value (tp.x ± RUB_OFFSET).
        // We pick whichever side keeps us closest.
        const laneIsY = isH(rubDir); // true = H target, lane = Y band
        const side = laneIsY
            ? (sp.y >= tp.y ? 1 : -1)
            : (sp.x >= tp.x ? 1 : -1);
        const laneCoord     = laneIsY ? tp.y + side * RUB_OFFSET : tp.x + side * RUB_OFFSET;
        const currentCoord  = laneIsY ? sp.y : sp.x;
        const laneOffset    = Math.abs(currentCoord - laneCoord);

        // ── Phase 2: IN LANE — align direction with rubDir ─────────────────────
        // The bug in the previous version required approachDist <= 8 here, which
        // blocked Phase 2 when the bot was in the correct lateral band but hadn't
        // reached the target's X position — unnecessary, since the body segment
        // behind the head spans the entire length from head to last turn point.
        if (laneOffset <= LANE_THRESH) {
            if (sd !== rubDir) {
                if (arePerp(sd, rubDir)) {
                    // One turn away — take it if the path is clear.
                    const c = rubDir === pA ? clearA : clearB;
                    if (c >= this.dangerDist * 0.80) { this._turn(snake, rubDir); return; }
                } else {
                    // Moving OPPOSITE to rubDir — must turn perpendicular first.
                    const sA = clearA, sB = clearB;
                    if (Math.max(sA, sB) >= this.dangerDist * 0.80)
                        this._turn(snake, sA >= sB ? pA : pB);
                }
            }
            // Already in rubDir: server will detect rubbing automatically.
            return;
        }

        // ── Phase 1: NOT IN LANE — navigate toward the lane ───────────────────
        // The direction that closes laneOffset:
        //   H target → change Y → need D.UP or D.DOWN
        //   V target → change X → need D.RIGHT or D.LEFT
        const laneDir = laneIsY
            ? (sp.y < laneCoord ? D.UP   : D.DOWN)
            : (sp.x < laneCoord ? D.RIGHT : D.LEFT);

        if (sd === laneDir) {
            // Already heading toward the lane — keep going.
            // Phase 2 will fire once laneOffset shrinks to LANE_THRESH.
            return;
        }

        if (arePerp(sd, laneDir)) {
            // Can turn directly toward the lane.
            const c = laneDir === pA ? clearA : clearB;
            if (c >= this.dangerDist * 0.90) {
                this._turn(snake, laneDir);
            } else {
                // laneDir blocked — at least move toward rubDir if possible.
                if (arePerp(sd, rubDir)) {
                    const rc = rubDir === pA ? clearA : clearB;
                    if (rc >= this.dangerDist) this._turn(snake, rubDir);
                }
            }
        } else {
            // Moving AWAY from lane (opposite of laneDir).
            // Need to turn 90° first (can't turn 180°).
            // Prefer rubDir if it's a valid perpendicular; otherwise take
            // whichever side has more open space.
            if (arePerp(sd, rubDir)) {
                const rc = rubDir === pA ? clearA : clearB;
                if (rc >= this.dangerDist * 0.90) { this._turn(snake, rubDir); return; }
            }
            const sA = clearA, sB = clearB;
            if (Math.max(sA, sB) >= this.dangerDist * 0.80)
                this._turn(snake, sA >= sB ? pA : pB);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  INTERCEPT — perpendicular blocking when timing is favourable
    // ─────────────────────────────────────────────────────────────────────────

    _tickIntercept(snake, W) {
        const { killTarget, pA, pB, clearA, clearB } = W;
        const sp = snake.position;
        const sd = snake.direction;

        // Find best intercept target across all loaded entities
        let bestTarget = null, bestIc = null, bestFactor = Infinity;
        const factor   = lerp(0.60, 1.10, this.sk.interceptPrecision);

        for (const e of Object.values(this.client.loadedEntities)) {
            if (e.type !== Enums.EntityTypes.ENTITY_PLAYER || e === snake) continue;

            // Try current direction
            if (arePerp(sd, e.direction)) {
                const ic = this._interceptCalc(sp, sd, e.position, e.direction);
                if (ic) {
                    const f = ic.botDist / (ic.targetDist + 0.01);
                    if (f <= factor && f < bestFactor) { bestFactor = f; bestTarget = e; bestIc = { ic, dir: sd }; }
                }
            }
            // Try perpendicular directions
            for (const [dir, clear] of [[pA, clearA], [pB, clearB]]) {
                if (clear < this.dangerDist * 1.1) continue;
                if (!arePerp(dir, e.direction)) continue;
                const ic = this._interceptCalc(sp, dir, e.position, e.direction);
                if (ic) {
                    const f = ic.botDist / (ic.targetDist + 0.01);
                    if (f <= factor && f < bestFactor) { bestFactor = f; bestTarget = e; bestIc = { ic, dir }; }
                }
            }
        }

        if (!bestTarget || !bestIc) { this._mission = 'ROAM'; return; }

        const { ic, dir: chosenDir } = bestIc;

        // Turn if needed to get on the intercept approach direction
        if (chosenDir !== sd && (chosenDir === pA || chosenDir === pB)) {
            const tClear = chosenDir === pA ? clearA : clearB;
            if (tClear >= this.dangerDist * 1.1) this._turn(snake, chosenDir);
            return;
        }

        // Check if we've arrived at the blocking position
        const offset  = lerp(5, 1.5, this.sk.interceptPrecision);
        const arrived = isH(sd)
            ? (sd === D.RIGHT ? sp.x >= ic.ix + offset : sp.x <= ic.ix - offset)
            : (sd === D.UP    ? sp.y >= ic.iy + offset : sp.y <= ic.iy - offset);

        if (arrived && ic.targetDist > 2) {
            this._tickExecuteKill(snake, W);
        }
        // else: keep heading toward kill position (no action needed)
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  HUNT — aggressive target pursuit
    //
    //  The bot actively manoeuvres to create kill opportunities:
    //    1. Try perpendicular intercept in current direction
    //    2. Try repositioning (turning) to create an intercept angle
    //    3. Try to get behind target for tail-follow rub
    //    4. Navigate toward target for future opportunity
    // ─────────────────────────────────────────────────────────────────────────

    _tickHunt(snake, W) {
        const { killTarget, pA, pB, clearA, clearB } = W;
        if (!killTarget?.spawned) { this._mission = 'ROAM'; return; }

        const sp = snake.position;
        const sd = snake.direction;
        const tp = killTarget.position;
        const td = killTarget.direction;
        const factor = lerp(0.68, 1.08, this.sk.interceptPrecision);

        // ── 1. Direct intercept in current direction ──────────────────────────
        if (arePerp(sd, td)) {
            const ic = this._interceptCalc(sp, sd, tp, td);
            if (ic && ic.botDist <= ic.targetDist * factor) {
                const offset = lerp(5, 1.5, this.sk.interceptPrecision);
                const arrived = isH(sd)
                    ? (sd === D.RIGHT ? sp.x >= ic.ix + offset : sp.x <= ic.ix - offset)
                    : (sd === D.UP    ? sp.y >= ic.iy + offset : sp.y <= ic.iy - offset);
                if (arrived && ic.targetDist > 2) { this._tickExecuteKill(snake, W); return; }
                return; // keep going, intercept in progress
            }
        }

        // ── 2. Reposition: turn to create better intercept angle ──────────────
        if (Math.random() < this.sk.setupMobility * 0.55) {
            for (const [dir, clear] of [[pA, clearA], [pB, clearB]]) {
                if (clear < this.dangerDist * 1.15) continue;
                const ic = this._interceptCalc(sp, dir, tp, td);
                if (ic && ic.botDist <= ic.targetDist * factor * lerp(1.0, 1.3, this.sk.setupMobility)) {
                    this._turn(snake, dir);
                    return;
                }
            }
        }

        // ── 3. Tail-follow: get behind target, match direction for rub ────────
        if (td === sd) {
            // Target is going same direction; try to get directly behind them
            const dx = tp.x - sp.x;
            const dy = tp.y - sp.y;
            const offset = isH(sd) ? dy : dx;
            if (Math.abs(offset) > 2) {
                const lateralDir = isH(sd)
                    ? (offset > 0 ? D.UP : D.DOWN)
                    : (offset > 0 ? D.RIGHT : D.LEFT);
                const lClear = lateralDir === pA ? clearA : clearB;
                if (lClear >= this.dangerDist * 1.1) {
                    this._turn(snake, lateralDir);
                    return;
                }
            }
            // Already aligned laterally: just follow (keep going same direction)
            return;
        }

        // ── 4. General navigation toward target ───────────────────────────────
        const dx = tp.x - sp.x;
        const dy = tp.y - sp.y;
        let navDir = null;
        if (isH(sd)) { if (Math.abs(dy) > 4) navDir = dy > 0 ? D.UP : D.DOWN; }
        else         { if (Math.abs(dx) > 4) navDir = dx > 0 ? D.RIGHT : D.LEFT; }

        if (navDir !== null) {
            const nClear = navDir === pA ? clearA : clearB;
            if (nClear >= this.dangerDist * 1.1) this._turn(snake, navDir);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  FOOD CHAIN — collect food in dense clusters, maintain eat-combo for speed
    //
    //  Primary speed source when no rub target is available.
    //  eatCombo >= 5 grants speed; bot steers toward the highest-density corridor.
    // ─────────────────────────────────────────────────────────────────────────

    _tickFoodChain(snake, W) {
        const { fdFwd, fdA, fdB, pA, pB, clearA, clearB, eatCombo } = W;
        const comboBoost = eatCombo >= 3 ? lerp(1.4, 3.0, this.sk.comboAwareness) : 1.0;

        const sFwd = fdFwd * comboBoost;
        const sA   = fdA   * comboBoost;
        const sB   = fdB   * comboBoost;

        // If already in best direction, don't break a running combo
        if (eatCombo >= 4 && sFwd >= sA && sFwd >= sB) return;

        // Turn toward highest food density
        let bestDir = null, bestFd = sFwd;
        if (sA > bestFd && clearA >= this.dangerDist)       { bestFd = sA; bestDir = pA; }
        if (sB > bestFd && sB > sA && clearB >= this.dangerDist) { bestFd = sB; bestDir = pB; }

        if (bestDir !== null) this._turn(snake, bestDir);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  COIL — fixed-arm square loop for large-snake defence
    // ─────────────────────────────────────────────────────────────────────────

    _enterCoil(snake) {
        this._coilActive  = true;
        this._coilCW      = Math.random() < 0.5;
        this._coilArm     = clamp(Math.sqrt(snake.visualLength) * 2.0, 28, 58);
        this._coilArm     = lerp(this._coilArm, 30, this.sk.coilTightness);
        this._coilLastPos = { x: snake.position.x, y: snake.position.y };
        this._mission     = 'COIL';
    }

    _tickCoil(snake) {
        const sp = snake.position;

        // Abort if external threat
        if (this._externalPathClear(snake, snake.direction) < 4) {
            this._exitCoil(snake);
            this._evade(snake, { pA: perp(snake.direction)[0], pB: perp(snake.direction)[1],
                                  clearA: 0, clearB: 0 });
            return;
        }

        // Exit to hunt if a sitting duck is nearby
        if (Math.random() < this.sk.coilHuntExit * 0.08) {
            const duck = this._findSittingDuck(snake);
            if (duck) {
                this._exitCoil(snake);
                this._killTarget = duck;
                this._mission = 'INTERCEPT';
                return;
            }
        }

        const dist = Math.abs(sp.x - this._coilLastPos.x) + Math.abs(sp.y - this._coilLastPos.y);
        if (dist >= this._coilArm) {
            const next = this._coilCW ? CW[snake.direction] : CCW[snake.direction];
            if (this._externalPathClear(snake, next) >= this._coilArm * 0.4) {
                this._turn(snake, next, true);
                this._coilLastPos = { x: sp.x, y: sp.y };
            } else {
                this._exitCoil(snake);
            }
        }
    }

    _exitCoil(snake) {
        this._coilActive    = false;
        this._mission       = 'ROAM';
        this._coilLastPos   = null;
        this._postCoilUntil = Date.now() + 2200;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  ESCAPE — gap scanning + rub-for-speed escape
    // ─────────────────────────────────────────────────────────────────────────

    _tickEscape(snake, W) {
        const { pA, pB, clearFwd, clearA, clearB, extraSpeed } = W;
        const sp = snake.position;

        const gF = this._gapPathClear(snake, snake.direction);
        const gA = this._gapPathClear(snake, pA);
        const gB = this._gapPathClear(snake, pB);

        // Score directions: gap length + food density (food = combo speed = escape speed)
        const cBoost = (snake.eatCombo >= 3) ? 1.6 : 1.0;
        const sF = gF + this._foodDensity(snake, snake.direction) * 0.4 * cBoost + this._centerBonus(snake, snake.direction);
        const sA = gA + this._foodDensity(snake, pA)              * 0.4 * cBoost + this._centerBonus(snake, pA);
        const sB = gB + this._foodDensity(snake, pB)              * 0.4 * cBoost + this._centerBonus(snake, pB);

        let bestDir = snake.direction, bestGap = gF;
        if (sA > sF && sA >= sB) { bestDir = pA; bestGap = gA; }
        if (sB > sF && sB > sA)  { bestDir = pB; bestGap = gB; }

        const isRubbing  = !!(snake.flags & Enums.EntityFlags.IS_RUBBING);
        const rubInfo    = this._findNearbyRubSegment(snake);
        const hasSpeed   = extraSpeed > lerp(5, 2, this.sk.rubAttrition);

        if (isRubbing && (hasSpeed || bestGap > 3)) {
            if (bestDir !== snake.direction) this._turn(snake, bestDir, true);
        } else if (rubInfo?.dir && !isRubbing && bestGap < this.dangerDist) {
            this._turn(snake, rubInfo.dir, true);
        } else if (bestGap > 0.5) {
            if (bestDir !== snake.direction) this._turn(snake, bestDir, true);
        } else {
            this._turn(snake, sA >= sB ? pA : pB, true);
        }

        if (Math.max(gF, gA, gB) > this.dangerDist * 2.5) this._mission = 'ROAM';
    }

    _findNearbyRubSegment(snake) {
        const sp = snake.position;
        const [pA, pB] = perp(snake.direction);
        let closest = null, closestDist = Infinity;

        for (const hit of this.server.segmentIndex.queryRadius(sp, 8)) {
            if (hit.snake === snake) continue;
            const p1 = hit.isH ? { x: hit.xMin, y: hit.y } : { x: hit.x, y: hit.yMin };
            const p2 = hit.isH ? { x: hit.xMax, y: hit.y } : { x: hit.x, y: hit.yMax };
            const d = MapFunctions.NearestPointOnLine(sp, p1, p2).distance;
            if (d < closestDist) { closestDist = d; closest = hit; }
        }
        if (!closest) return null;

        let dir = null;
        if (closest.isH) { const dy = closest.y - sp.y; if (Math.abs(dy) < 8) dir = dy > 0 ? D.UP : D.DOWN; }
        else              { const dx = closest.x - sp.x; if (Math.abs(dx) < 8) dir = dx > 0 ? D.RIGHT : D.LEFT; }
        if (dir !== pA && dir !== pB) dir = null;
        return { dir, dist: closestDist };
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  ROAM — organic movement with centre pull and open-space preference
    // ─────────────────────────────────────────────────────────────────────────

    _tickRoam(snake, W) {
        const { pA, pB, clearFwd, clearA, clearB, fdFwd, fdA, fdB } = W;
        const sp   = snake.position;
        const half = this.server.config.ArenaSize / 2;
        const edgeR = Math.max(Math.abs(sp.x), Math.abs(sp.y)) / half;

        // ── Centre pull: steer back when drifting to the edge ─────────────────
        if (edgeR > lerp(0.68, 0.52, this.sk.centerAffinity) && Math.random() < edgeR * 0.55) {
            const cd = isH(snake.direction)
                ? (sp.y > 0 ? D.DOWN : D.UP)
                : (sp.x > 0 ? D.LEFT : D.RIGHT);
            const cScore = cd === pA ? clearA : clearB;
            if (cScore >= this.dangerDist * 1.1) { this._turn(snake, cd); return; }
        }

        // ── Food seeking: steer toward the food-richest safe direction ─────────
        // Even in ROAM, the bot should actively collect food to grow and maintain
        // eat-combo speed.  Compare perpendicular food density against forward.
        const comboBoost = (snake.eatCombo || 0) >= 3
            ? lerp(1.3, 2.5, this.sk.comboAwareness) : 1.0;
        const sFwd = fdFwd * comboBoost;
        const sA   = fdA   * comboBoost;
        const sB   = fdB   * comboBoost;

        // Only turn for food if perpendicular density is meaningfully higher,
        // the path there is safe, and a random roll passes (avoids constant
        // jittery turning every tick — looks more human-like).
        const foodTurnChance = lerp(0.12, 0.40, this.sk.foodGreed);
        if (Math.random() < foodTurnChance) {
            if (sA > sFwd + 0.5 && sA > sB && clearA >= this.dangerDist * 1.05) {
                this._turn(snake, pA); return;
            }
            if (sB > sFwd + 0.5 && sB > sA && clearB >= this.dangerDist * 1.05) {
                this._turn(snake, pB); return;
            }
        }

        // ── Congregation: drift toward clusters of other snakes ───────────────
        // More snakes = more rub targets + food from kills.  Bots that roam
        // toward others naturally find more hunting opportunities.
        if (Math.random() < this.sk.aggressionLevel * 0.15) {
            const sdFwd = this._snakeDensity(snake, snake.direction);
            const sdA   = this._snakeDensity(snake, pA);
            const sdB   = this._snakeDensity(snake, pB);
            const maxSD = Math.max(sdFwd, sdA, sdB);
            if (maxSD > 0 && sdA > sdFwd + 0 && sdA >= sdB && clearA >= this.dangerDist * 1.05) {
                this._turn(snake, pA); return;
            }
            if (maxSD > 0 && sdB > sdFwd + 0 && sdB > sdA && clearB >= this.dangerDist * 1.05) {
                this._turn(snake, pB); return;
            }
        }

        // ── Open space preference: avoid cramped paths ─────────────────────────
        if (clearFwd < this.lookAhead * 0.5) {
            const best = clearA >= clearB ? pA : pB;
            if (Math.max(clearA, clearB) > clearFwd * 1.4 + 5 &&
                Math.max(clearA, clearB) >= this.dangerDist * 1.1)
                this._turn(snake, best);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  PATH SAFETY
    // ─────────────────────────────────────────────────────────────────────────

    _pathClear(snake, direction, clearance = CLEARANCE) {
        const postCoil = Date.now() < this._postCoilUntil;
        const half  = this.server.config.ArenaSize / 2;
        const wDist = wallDist(snake.position, direction, half);
        if (wDist <= 1) return 0;

        const maxD = Math.min(this.lookAhead, wDist - 1);
        const sp   = snake.position;
        const ep   = proj(sp, direction, maxD);
        const hits = this.server.segmentIndex.queryLine(sp.x, sp.y, ep.x, ep.y);
        let closest = maxD;

        for (const hit of hits) {
            if (hit.snake === snake) {
                if (postCoil) continue;
                if (hit.id === snake._headSegHandle?.id)     continue;
                if (hit.id === snake._bodySegHandles[0]?.id) continue;
            }
            let d;
            if (isH(direction)) {
                d = !hit.isH ? Math.abs(hit.x - sp.x) - clearance
                             : (direction === D.RIGHT ? hit.xMin - sp.x - clearance
                                                      : sp.x - hit.xMax - clearance);
            } else {
                d = hit.isH  ? Math.abs(hit.y - sp.y) - clearance
                             : (direction === D.UP    ? hit.yMin - sp.y - clearance
                                                      : sp.y - hit.yMax - clearance);
            }
            closest = Math.min(closest, Math.max(0, d));
        }
        return closest;
    }

    _gapPathClear(snake, direction) {
        return this._pathClear(snake, direction, GAP_CLEARANCE);
    }

    _externalPathClear(snake, direction) {
        const half  = this.server.config.ArenaSize / 2;
        const wDist = wallDist(snake.position, direction, half);
        if (wDist <= 1) return 0;
        const maxD = Math.min(this.lookAhead, wDist - 1);
        const sp   = snake.position;
        const ep   = proj(sp, direction, maxD);
        const hits = this.server.segmentIndex.queryLine(sp.x, sp.y, ep.x, ep.y);
        let closest = maxD;
        for (const hit of hits) {
            if (hit.snake === snake) continue;
            let d;
            if (isH(direction)) {
                d = !hit.isH ? Math.abs(hit.x - sp.x) - CLEARANCE
                             : (direction === D.RIGHT ? hit.xMin - sp.x - CLEARANCE
                                                      : sp.x - hit.xMax - CLEARANCE);
            } else {
                d = hit.isH  ? Math.abs(hit.y - sp.y) - CLEARANCE
                             : (direction === D.UP    ? hit.yMin - sp.y - CLEARANCE
                                                      : sp.y - hit.yMax - CLEARANCE);
            }
            closest = Math.min(closest, Math.max(0, d));
        }
        return closest;
    }

    // ── Utilities ─────────────────────────────────────────────────────────────

    _evade(snake, W) {
        const pA = W?.pA ?? perp(snake.direction)[0];
        const pB = W?.pB ?? perp(snake.direction)[1];
        const sA = (W?.clearA ?? this._pathClear(snake, pA)) + this._centerBonus(snake, pA);
        const sB = (W?.clearB ?? this._pathClear(snake, pB)) + this._centerBonus(snake, pB);
        this._turn(snake, sA >= sB ? pA : pB, true);
    }

    _centerBonus(snake, dir) {
        const half = this.server.config.ArenaSize / 2;
        const p    = proj(snake.position, dir, this.lookAhead * 0.4);
        return -(Math.max(Math.abs(p.x), Math.abs(p.y)) / half) * 4;
    }

    _foodDensity(snake, direction, length = 55) {
        const sp = snake.position, CW = 10;
        let count = 0;
        for (const e of Object.values(this.client.loadedEntities)) {
            if (e.type !== Enums.EntityTypes.ENTITY_ITEM || !e.position) continue;
            const dx = e.position.x - sp.x, dy = e.position.y - sp.y;
            switch (direction) {
                case D.UP:    if (dy > 0 && dy < length && Math.abs(dx) < CW) count++; break;
                case D.DOWN:  if (dy < 0 && dy > -length && Math.abs(dx) < CW) count++; break;
                case D.RIGHT: if (dx > 0 && dx < length && Math.abs(dy) < CW) count++; break;
                case D.LEFT:  if (dx < 0 && dx > -length && Math.abs(dy) < CW) count++; break;
            }
        }
        return count;
    }

    /**
     * Detect a dense food trail in any of the 4 cardinal directions.
     * A trail is defined as ≥5 items in a narrow (width 7) corridor of
     * length 60 units.  Trails are left by recently killed snakes and
     * represent a high-value food opportunity the bot should prioritise.
     *
     * Returns the best direction, or null if no trail.
     */
    _detectFoodTrail(snake) {
        const sp   = snake.position;
        const W    = 7;   // narrow corridor width
        const L    = 65;  // corridor length
        const MIN  = 5;   // minimum items to count as a trail

        let bestDir = null, bestCount = 0;

        for (const dir of [D.UP, D.DOWN, D.LEFT, D.RIGHT]) {
            let count = 0;
            for (const e of Object.values(this.client.loadedEntities)) {
                if (e.type !== Enums.EntityTypes.ENTITY_ITEM || !e.position) continue;
                const dx = e.position.x - sp.x, dy = e.position.y - sp.y;
                switch (dir) {
                    case D.UP:    if (dy > 0 && dy < L && Math.abs(dx) < W) count++; break;
                    case D.DOWN:  if (dy < 0 && dy > -L && Math.abs(dx) < W) count++; break;
                    case D.RIGHT: if (dx > 0 && dx < L && Math.abs(dy) < W) count++; break;
                    case D.LEFT:  if (dx < 0 && dx > -L && Math.abs(dy) < W) count++; break;
                }
            }
            if (count > bestCount) { bestCount = count; bestDir = dir; }
        }
        return bestCount >= MIN ? bestDir : null;
    }

    /**
     * Count how many OTHER snakes are in a given direction within `range` units.
     * Used for congregation: bots are drawn toward clusters because clusters mean
     * more rub targets and more kill opportunities.
     */
    _snakeDensity(snake, direction, range = 110) {
        const sp = snake.position;
        let count = 0;
        for (const e of Object.values(this.client.loadedEntities)) {
            if (e.type !== Enums.EntityTypes.ENTITY_PLAYER || e === snake) continue;
            const dx = e.position.x - sp.x, dy = e.position.y - sp.y;
            switch (direction) {
                case D.UP:    if (dy > 0 && dy < range) count++; break;
                case D.DOWN:  if (dy < 0 && dy > -range) count++; break;
                case D.RIGHT: if (dx > 0 && dx < range) count++; break;
                case D.LEFT:  if (dx < 0 && dx > -range) count++; break;
            }
        }
        return count;
    }

    _nearestThreatDist(snake) {
        let minD = Infinity;
        for (const e of Object.values(this.client.loadedEntities)) {
            if (e.type !== Enums.EntityTypes.ENTITY_PLAYER || e === snake) continue;
            const d = MapFunctions.GetDistance(snake.position, e.position);
            if (d < minD) minD = d;
        }
        return minD;
    }

    _findSittingDuck(snake) {
        for (const e of Object.values(this.client.loadedEntities)) {
            if (e.type !== Enums.EntityTypes.ENTITY_PLAYER || e === snake) continue;
            const dist = MapFunctions.GetDistance(snake.position, e.position);
            if (dist > 45) continue;
            if (MapFunctions.GetDistance(snake.position, proj(e.position, e.direction, dist * 0.7)) < 18)
                return e;
        }
        return null;
    }

    _interceptCalc(sp, sd, tp, td) {
        let ix, iy, botDist, targetDist;
        if (isH(sd)) {
            if (!arePerp(sd, td)) return null;
            ix = tp.x; iy = sp.y;
            if (sd === D.RIGHT && ix < sp.x) return null;
            if (sd === D.LEFT  && ix > sp.x) return null;
            if (td === D.UP    && iy < tp.y) return null;
            if (td === D.DOWN  && iy > tp.y) return null;
            botDist = Math.abs(ix - sp.x); targetDist = Math.abs(iy - tp.y);
        } else {
            if (!arePerp(sd, td)) return null;
            ix = sp.x; iy = tp.y;
            if (sd === D.UP    && iy < sp.y) return null;
            if (sd === D.DOWN  && iy > sp.y) return null;
            if (td === D.RIGHT && ix < tp.x) return null;
            if (td === D.LEFT  && ix > tp.x) return null;
            botDist = Math.abs(iy - sp.y); targetDist = Math.abs(ix - tp.x);
        }
        return { ix, iy, botDist, targetDist };
    }

    // ── Turning ───────────────────────────────────────────────────────────────

    _turn(snake, direction, force = false) {
        if (!snake?.spawned) return;
        if (direction === snake.direction) return;
        if (Math.abs(snake.direction - direction) === 2) return; // opposite

        const now  = Date.now();
        const sp   = snake.position;
        const dist = Math.abs(sp.x - this._lastTurnPos.x) + Math.abs(sp.y - this._lastTurnPos.y);
        const minD = force ? MIN_FORCE_DIST : MIN_TURN_DIST;

        if (!force && now - this._lastTurnAt < this._minTurnMs) return;
        if (dist < minD) return; // always enforce minimum distance, even on force

        // ── Hairpin prevention ────────────────────────────────────────────────
        // If the proposed direction is collinear with the most recently created
        // body segment (bodySegHandles[0]), that segment is currently excluded
        // from _pathClear — but after this second turn it becomes [1] and WILL
        // be detected.  Prevent the hairpin by refusing the turn.
        const h0 = snake._bodySegHandles?.[0];
        if (h0) {
            if ( h0.isH && isH(direction) && Math.abs(sp.y - h0.fixedCoord) < CLEARANCE * 1.5) return;
            if (!h0.isH && isV(direction) && Math.abs(sp.x - h0.fixedCoord) < CLEARANCE * 1.5) return;
        }

        const axis = isV(direction) ? 'x' : 'y';
        try {
            snake.turn(direction, snake.position[axis]);
            this._lastTurnAt  = now;
            this._lastTurnPos = { x: sp.x, y: sp.y };
        } catch (_) {}
    }

    // ── Idle turns (low-skill bots only) ─────────────────────────────────────

    _scheduleIdleTurn() {
        const lo = lerp(1800, 3500, this.sk.reactionSpeed);
        const hi = lerp(5500, 9500, this.sk.reactionSpeed);
        this._idleTimer = setTimeout(() => {
            if (this.server.stopped) return;
            const snake = this.client.snake;
            if (snake?.spawned && !this._coilActive) {
                const [pA, pB] = perp(snake.direction);
                const sA = this._pathClear(snake, pA), sB = this._pathClear(snake, pB);
                if (Math.max(sA, sB) >= this.dangerDist * 1.1)
                    this._turn(snake, sA >= sB ? pA : pB);
            }
            this._scheduleIdleTurn();
        }, rng(lo, hi));
    }
}

module.exports = Bot;
