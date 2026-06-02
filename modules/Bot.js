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
// Half-window the bot streams entities within. Must EXCEED the largest AI sensory
// range (kill targeting scans to 220) or the bot cannot see what it decides on.
// Set above 220 so congregation can perceive snake clusters BEYOND hunt range and
// drift toward the action (otherwise hunting always preempts and congregation is
// dead code). Bots send no network packets, so the only cost is a larger spatial
// query + more loaded entities per bot tick.
const BOT_SENSE_RANGE = 340;

// Lateral distance the bot aims to travel from a target's body while rubbing.
// Speed accrual is rubSpeed = (MaxRubAcceleration-1) × (5 - dist)/4, so a SMALLER
// offset accrues boost faster: offset 2 → 2.25/tick, offset 1.4 → 2.7/tick (the
// server rubbing radius is 4, so anything < 4 rubs; < ~1 risks crossing the body).
// Bots intentionally hug close to maximise speed gain, matching skilled players.
const RUB_OFFSET_C = 1.4;
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

// Build the BASE name (adjective + noun, no number) from a seed.  The trailing
// number is added later and encodes skill, so the base must NOT include it —
// otherwise the number would feed back into skillsFromName (circular).
function makeBaseName(seed) {
    const r   = new Rng(seed);
    const adj = ADJ[Math.floor(r.next() * ADJ.length)];
    const n   = NOUN[Math.floor(r.next() * NOUN.length)];
    return `${adj}${n}`;
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

// ── Overall skill rating ────────────────────────────────────────────────────
//
//  A weighted average of the skills that genuinely make a snake a STRONGER
//  player (reaction speed, awareness, intercept timing, body control, escape).
//  Pure style/preference traits (target-size preference, coil style, ambush
//  tendency, centre affinity, food/aggression appetite) are excluded — they
//  shape HOW a bot plays, not how well.  Returns 0..1.
//
//  Personality is derived from the same skill vector, so the rating correlates
//  with personality: a precise, aware, self-preserving build (e.g. TACTICIAN /
//  PREDATOR) scores high, while a reckless or erratic build scores lower.
const SKILL_COMPETENCE = {
    reactionSpeed:      1.0,  // reacting fast is the single biggest skill factor
    interceptPrecision: 1.0,  // landing the kill cut
    bodyAwareness:      1.0,  // not crashing into your own tail
    lookaheadSkill:     0.8,  // seeing obstacles early
    killInstinct:       0.8,  // converting position into kills
    selfPreservation:   0.8,  // staying alive
    dangerSensitivity:  0.7,  // reading threats
    rubAttrition:       0.7,  // building speed off bodies
    comboAwareness:     0.7,  // sustaining eat-combo speed
    escapeInstinct:     0.7,  // bailing out of traps in time
    setupMobility:      0.5,  // repositioning for a better angle
    wallWarning:        0.4,  // edge awareness
    foodLookAhead:      0.4,  // routing through food
    postKillCollection: 0.4,  // capitalising on kills
    openSpaceValue:     0.3,  // favouring room to manoeuvre
    huntPersistence:    0.3,  // seeing a hunt through
};

function overallSkill(sk) {
    let sum = 0, wsum = 0;
    for (const key in SKILL_COMPETENCE) {
        const w = SKILL_COMPETENCE[key];
        sum  += (sk[key] ?? 0) * w;
        wsum += w;
    }
    return wsum > 0 ? sum / wsum : 0.5;
}

// Map overall skill (0..1) to a 1..99 rating shown as the trailing name number.
// Higher skill → higher number.  A mild contrast curve around the midpoint
// widens the spread so tiers are legible (uniform skills cluster near 0.5).
function skillRating(sk) {
    const s = overallSkill(sk);
    const contrasted = 0.5 + (s - 0.5) * 1.6;           // stretch around the centre
    return clamp(Math.round(contrasted * 98) + 1, 1, 99);
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

        // ── Unique seeded name + skill rating ─────────────────────────────────
        // Each bot gets a FULLY RANDOM seed so base names are diverse across the
        // whole name space (50 adj × 50 noun = 2 500 combos; bot counts are ~20).
        // Skills are derived deterministically from the BASE name (adj+noun); the
        // trailing number is then a 1-99 skill rating, so a stronger build shows a
        // higher number (e.g. BOT_ShadowViper83 is more skilled than BOT_IronCoil29).
        // Uniqueness is checked on the base name because the rating is a function
        // of it (same base → same skills → same rating → same full name).
        if (!server._usedBotNames) server._usedBotNames = new Set();

        let base;
        let attempts = 0;
        do {
            // Mix multiple entropy sources so even rapid-fire construction
            // produces well-spread seeds.
            const seed = ((Math.random() * 0xFFFFFFFF) ^ (Date.now() << 5) ^ (attempts * 0x9E3779B9)) >>> 0;
            base = makeBaseName(seed);
            attempts++;
        } while (server._usedBotNames.has(base) && attempts < 500);
        server._usedBotNames.add(base);
        this._baseName = base; // tracked in _usedBotNames; released in destroy()

        // ── Skills & personality ──────────────────────────────────────────────
        this.sk          = skillsFromName(base);
        this.personality = personalityFromSkills(this.sk);

        // Name = BOT_ + base + skill rating.  Capped at the 25-char nick limit.
        const rating = skillRating(this.sk);
        this.nickname = `BOT_${base}${rating}`.slice(0, 25);
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

        // ── Post-kill food rush ───────────────────────────────────────────────
        this._freshFoodBoostUntil = 0; // timestamp: elevated food priority expires

        // ── Debug ──────────────────────────────────────────────────────────────
        this._debugMode  = process.env.BOT_DEBUG === '1';
        this._debugLogAt = 0;

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
        this.server._usedBotNames?.delete(this._baseName);
    }

    _initClient(server) {
        const c = new Client(server, { send: () => {} }, null);
        c.isBot = true;
        // ── CRITICAL: sensory window ──────────────────────────────────────────
        // Human clients default to a 128×64 streaming window (half-width 64), set
        // to match a browser viewport. The bot AI, however, reasons about targets
        // up to ~220 units away (kill targeting), rub targets to 160, congregation
        // to 110, fresh-death food to 200. With the default window the bot only
        // ever loads entities within ±64 x / ±32 y of its head — far smaller than
        // its decision range — so it was effectively BLIND to almost every snake
        // it was supposed to hunt, and to kill-food dropped just out of view.
        // Bots don't send network packets (their socket is a no-op), so a large
        // window only costs a slightly bigger spatial query per bot tick.
        // BOT_SENSE_RANGE is the half-window; full window is 2× that on each axis.
        c.windowSizeX = BOT_SENSE_RANGE * 2;
        c.windowSizeY = BOT_SENSE_RANGE * 2;
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
        if (this._debugMode) this._debugLog(snake, W);

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

        // Fresh death tracking: check server's death event log
        const freshDeathInfo = this._checkFreshDeaths(snake);
        const hasFreshBoost  = Date.now() < this._freshFoodBoostUntil || (freshDeathInfo?.dist ?? Infinity) < 150;

        // Per-direction danger score: nearby enemy heads, head-ons score highest
        const riskFwd = this._pathRisk(snake, snake.direction);
        const riskA   = this._pathRisk(snake, pA);
        const riskB   = this._pathRisk(snake, pB);

        // Food trail: narrow corridor with 5+ items in any direction (from kills)
        const foodTrailDir = this._detectFoodTrail(snake, hasFreshBoost);

        return {
            pA, pB, clearFwd, clearA, clearB, maxClear,
            isRubbing, extraSpeed, eatCombo,
            fdFwd, fdA, fdB,
            killTarget, rubTarget, rubInfo,
            foodTrailDir,
            freshDeathInfo, hasFreshBoost,
            riskFwd, riskA, riskB,
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  MISSION SELECTION
    //
    //  Priority ladder (highest to lowest), reflecting the directive that FOOD
    //  comes first ("get food whenever possible — if it sees a lot of food or a
    //  new death, get it") while the bot is ALSO always hunting when no food is
    //  on offer ("must always be trying to kill, even hunting snakes down"):
    //
    //    1. EXECUTE_KILL — already in position + have speed: land the cut now.
    //                      (A kill DROPS a food pile, so finishing one IS food.)
    //    2. FOOD_TRAIL   — a fresh death / dense fresh food line: PRIMARY food.
    //                      Grabs guaranteed dropped food before anything else.
    //    3. MAINTAIN_RUB — already rubbing: keep building speed toward a kill.
    //    4. SPEED_KILL   — banked speed, not rubbing: strike before it decays.
    //    5. FOOD_CHAIN   — lots of scattered food nearby & safe: PRIMARY food,
    //                      ranked above STARTING a new hunt.
    //    6. HUNT_KILL    — committed target: relentless pursuit / hunt-down.
    //    7. HUNT commit  — no food on offer → commit to a kill (always hunting).
    //    8. COIL         — large snake, defensive.
    //    9. ROAM         — seek food, clusters and deaths.
    //
    //  Food is the top non-finishing priority; hunting fills every gap where no
    //  food opportunity exists, so bots are never idle and never ignore a kill.
    // ─────────────────────────────────────────────────────────────────────────

    _selectMission(snake, W) {
        const { isRubbing, extraSpeed, killTarget,
                fdFwd, fdA, fdB, clearFwd, clearA, clearB, pA, pB,
                foodTrailDir, freshDeathInfo,
                riskFwd, riskA, riskB } = W;

        const speedThreshold = lerp(14, 4, this.sk.rubSpeedThreshold);
        const dirClear = d => d === pA ? clearA : d === pB ? clearB : clearFwd;
        const dirRisk  = d => d === pA ? riskA  : d === pB ? riskB  : riskFwd;

        // Refresh the post-kill food boost timer whenever a death is in range.
        if (freshDeathInfo && freshDeathInfo.dist < 220) {
            this._freshFoodBoostUntil = Math.max(
                this._freshFoodBoostUntil,
                Date.now() + Math.round(lerp(5000, 11000, this.sk.postKillCollection))
            );
        }

        // ── 1. EXECUTE_KILL — in position with speed: finish it (makes food) ───
        if (isRubbing && extraSpeed >= speedThreshold && killTarget) return 'EXECUTE_KILL';

        // ── 2. FOOD RUSH — fresh death / dense fresh trail: PRIMARY directive ──
        //   A new death is a guaranteed pile of food available NOW, so it preempts
        //   speed-building and hunt commitment.  If the dense corridor is already
        //   visible we follow it; otherwise we navigate toward the death point and
        //   the corridor takes over once we are close (_tickFoodTrail handles both).
        if (freshDeathInfo) {
            if (foodTrailDir) {
                const clearReq = this.dangerDist * 0.70;
                if (dirClear(foodTrailDir) >= clearReq || foodTrailDir === snake.direction)
                    return 'FOOD_TRAIL';
            }
            // No corridor yet, but a reachable death pile is in sensory range.
            if (freshDeathInfo.dist < 300) return 'FOOD_TRAIL';
        }
        // Even with no logged death, a very dense visible trail is fresh-kill food.
        if (foodTrailDir) {
            const clearReq = this.dangerDist * 0.85;
            if (dirClear(foodTrailDir) >= clearReq || foodTrailDir === snake.direction)
                return 'FOOD_TRAIL';
        }

        // ── 3. Currently rubbing — keep building speed toward a kill ───────────
        if (isRubbing) return 'MAINTAIN_RUB';

        // ── 4. Banked speed — strike before it decays ──────────────────────────
        if (extraSpeed >= speedThreshold && killTarget) return 'SPEED_KILL';

        // ── 5. FOOD CHAIN — lots of food nearby & safe: PRIMARY over hunting ───
        {
            const comboBoost = W.eatCombo >= 3 ? lerp(1.5, 3.0, this.sk.comboAwareness) : 1.0;
            const fdFwdC = fdFwd * comboBoost, fdAC = fdA * comboBoost, fdBC = fdB * comboBoost;
            const maxFd  = Math.max(fdFwdC, fdAC, fdBC);
            // Greedy bots grab even small piles; the primary directive is food.
            const foodThresh = lerp(1.6, 0.6, this.sk.foodGreed);
            if (maxFd >= foodThresh) {
                const bestDir = fdFwdC >= fdAC && fdFwdC >= fdBC ? snake.direction
                              : fdAC   >= fdBC                   ? pA : pB;
                const riskTol = lerp(0.85, 0.30, this.sk.selfPreservation);
                if (dirRisk(bestDir) < riskTol) return 'FOOD_CHAIN';
                if (dirRisk(bestDir) < 0.60 && this.sk.foodGreed > 0.70) return 'FOOD_CHAIN';
            }
        }

        // ── 6. HUNT (committed) — relentless pursuit, hunt the target down ─────
        if (this._killTarget?.spawned && this.client.loadedEntities[this._killTarget.id])
            return 'HUNT_KILL';

        // ── 7. HUNT (commit to a new target) — always be trying to kill ────────
        //   No food opportunity exists, so the bot actively commits to a kill.
        //   Eagerness is high for every personality (bots are never passive) and
        //   fades only gently with distance so distant snakes still get hunted down.
        if (killTarget) {
            const dist = MapFunctions.GetDistance(snake.position, killTarget.position);
            const EAGERNESS = {
                BERSERKER:   0.97,
                PREDATOR:    0.95,
                TACTICIAN:   0.88,
                SPEEDSTER:   0.82,
                OPPORTUNIST: 0.80,
                WILDCARD:    0.75,
                SPEEDFARMER: 0.66,
                SURVIVOR:    0.58,
                DEFENDER:    0.55,
                FARMER:      0.50,
            };
            let eagerness = EAGERNESS[this.personality] ?? 0.72;
            if (dist < 80) eagerness = Math.max(eagerness, 0.92);
            else           eagerness *= Math.max(0.55, 1 - (dist - 80) / 300);

            if (Math.random() < eagerness) {
                this._killTarget = killTarget;
                this._lastTargetSwap = Date.now();
                return 'HUNT_KILL';
            }
        }

        // ── 8. Coil ───────────────────────────────────────────────────────────
        if (snake.visualLength >= this._coilMinLen &&
            Math.random() < 0.014 * this.sk.coilTrigger &&
            clearFwd > 55 && this._nearestThreatDist(snake) > this.lookAhead * 1.5)
            return 'COIL';

        return 'ROAM';
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  KILL TARGETING
    //
    //  Scores every loaded player by kill potential and returns the BEST candidate.
    //  Considers: proximity, direction geometry, speed differential, wall
    //  proximity, body length (rub potential), and skill-based preferences.
    //
    //  This function is PURE: it does not mutate this._killTarget.  Commitment is
    //  owned by _selectMission (which applies the personality eagerness roll) and
    //  by persistence below.  Keeping it pure means the EAGERNESS weights actually
    //  govern whether the bot commits, instead of being bypassed by a side effect.
    //  Persistence: while a committed target stays valid and within the hold
    //  window, it is returned as the best candidate so the bot does not flip-flop.
    // ─────────────────────────────────────────────────────────────────────────

    _selectKillTarget(snake) {
        const now  = Date.now();
        // Longer hold = the bot stays locked on one victim and hunts it down
        // instead of flip-flopping between targets every second.
        const hold = lerp(1600, 4500, this.sk.huntPersistence);

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

        // Pure: do NOT commit here. _selectMission owns commitment via the
        // personality eagerness roll, then sets this._killTarget + _lastTargetSwap.
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
        const RUB_OFFSET  = RUB_OFFSET_C;
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
        const RUB_OFFSET  = RUB_OFFSET_C;
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
        // Never turn while in the lane — any turn ends rubbing.
        // The server detects rubbing when our head is within 4 units of a body
        // segment, which is guaranteed since our lane offset is ≤ 3 units.
        if (inLane) {
            // Overshoot guard: reset if far past head with no kill (target turned away)
            if (headAdv > 80) { this._killTarget = null; }
            return; // keep going straight
        }

        // ── PHASE 1 APPROACH: navigate into the rub lane ──────────────────────
        // We use target-excluding path clears (apA / apB / apLD / apTd) so that
        // the target's own body segments don't make the approach look impassable.
        // The clearance threshold is also lower: we only need room for OUR body.
        const LANE_THRESH = 2;
        const AP_THRESH   = this.dangerDist * 0.50; // approach-specific lower threshold
        const apA  = this._pathClear(snake, pA,      CLEARANCE, target);
        const apB  = this._pathClear(snake, pB,      CLEARANCE, target);

        if (laneOffset <= LANE_THRESH) {
            // Laterally aligned — turn to match target's direction
            if (sd !== td) {
                if (arePerp(sd, td)) {
                    const c = td === pA ? apA : apB;
                    if (c >= AP_THRESH) { this._turn(snake, td); return; }
                } else {
                    // Opposite direction — pick the most open perpendicular first
                    if (Math.max(apA, apB) >= AP_THRESH)
                        this._turn(snake, apA >= apB ? pA : pB);
                }
            }
            return;
        }

        const laneDir = laneIsY
            ? (sp.y < laneCoord ? D.UP   : D.DOWN)
            : (sp.x < laneCoord ? D.RIGHT : D.LEFT);

        if (sd === laneDir) { return; } // already heading toward the lane

        const apLD = this._pathClear(snake, laneDir, CLEARANCE, target);
        const apTd = this._pathClear(snake, td,      CLEARANCE, target);

        if (arePerp(sd, laneDir)) {
            // Can turn directly toward the lane
            if (apLD >= AP_THRESH) {
                this._turn(snake, laneDir);
            } else if (arePerp(sd, td) && apTd >= AP_THRESH) {
                // Lane blocked — at least align with target direction
                this._turn(snake, td);
            }
        } else {
            // Moving away from lane — must rotate 90° first
            if (arePerp(sd, td) && apTd >= AP_THRESH) {
                this._turn(snake, td); return;
            }
            // Otherwise take whichever perpendicular is most open
            if (Math.max(apA, apB) >= AP_THRESH)
                this._turn(snake, apA >= apB ? pA : pB);
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
        const { foodTrailDir, freshDeathInfo } = W;

        // ── Vacuum: steer toward the nearest visible food item ─────────────────
        // Sweeping item-to-item naturally centres the bot ON the dropped line (not
        // skimming beside it), so it collects the bulk of a death pile efficiently
        // instead of following a cardinal direction and drifting off the food.
        const food = this._nearestFood(snake);
        if (food) { this._navigateToward(snake, food, W); return; }

        // ── No food loaded yet — drive to the logged death point ───────────────
        // The dead snake's segments were removed on death, so the location is safe
        // to approach; once close, the dropped food enters range and is vacuumed.
        if (freshDeathInfo) { this._navigateToward(snake, freshDeathInfo, W); return; }

        // Stale corridor flag but nothing to chase — let the next tick re-evaluate.
        this._mission = 'ROAM';
    }

    // ── Nearest visible food item ──────────────────────────────────────────────

    _nearestFood(snake, radius = 120) {
        const sp = snake.position;
        let best = null, bestD2 = radius * radius;
        for (const e of Object.values(this.client.loadedEntities)) {
            if (e.type !== Enums.EntityTypes.ENTITY_ITEM || !e.position) continue;
            const dx = e.position.x - sp.x, dy = e.position.y - sp.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) { bestD2 = d2; best = e.position; }
        }
        return best;
    }

    // ── Navigate toward a world point ──────────────────────────────────────────
    //
    //  Steers onto the cross-axis offset to a point, turning only when the chosen
    //  perpendicular is safe and never reversing.  Forward progress along the main
    //  axis happens naturally; this just corrects the lateral error so the bot
    //  converges on `point`.  The tolerance (1.5) is tighter than the food eat
    //  radius (3) so the bot lands ON food lines instead of skimming past them.

    _navigateToward(snake, point, W) {
        const { pA, pB, clearA, clearB } = W;
        const sp = snake.position;
        const sd = snake.direction;
        const dx = point.x - sp.x, dy = point.y - sp.y;

        let desired = null;
        if (isH(sd)) {
            if (Math.abs(dy) > 1.5) desired = dy > 0 ? D.UP : D.DOWN;     // correct vertical error
        } else {
            if (Math.abs(dx) > 1.5) desired = dx > 0 ? D.RIGHT : D.LEFT;  // correct horizontal error
        }
        if (desired === null) return; // aligned on the cross-axis — keep going forward

        const c = desired === pA ? clearA : desired === pB ? clearB : this._pathClear(snake, desired);
        if (c >= this.dangerDist) this._turn(snake, desired);
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
        const RUB_OFFSET  = RUB_OFFSET_C;
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

        // Food is the primary directive, so even while roaming the bot actively
        // swings toward the food-richest safe direction.  The random roll only
        // prevents jittery every-tick turning (keeps motion human-like).
        const foodTurnChance = lerp(0.30, 0.65, this.sk.foodGreed);
        if (Math.random() < foodTurnChance) {
            if (sA > sFwd + 0.5 && sA > sB && clearA >= this.dangerDist * 1.05) {
                this._turn(snake, pA); return;
            }
            if (sB > sFwd + 0.5 && sB > sA && clearB >= this.dangerDist * 1.05) {
                this._turn(snake, pB); return;
            }
        }

        // ── Congregation with spacing ─────────────────────────────────────────
        // All personalities drift toward snake clusters (rub targets + kill food).
        // When already close to other snakes, orbit rather than pushing deeper,
        // preventing bots from piling into the same point and mass-dying.
        const congregationProb = lerp(0.08, 0.30, this.sk.aggressionLevel);
        if (Math.random() < congregationProb) {
            const sdFwd = this._snakeDensity(snake, snake.direction);
            const sdA   = this._snakeDensity(snake, pA);
            const sdB   = this._snakeDensity(snake, pB);
            const maxSD = Math.max(sdFwd, sdA, sdB);
            if (maxSD > 0) {
                const nearestDist = this._nearestThreatDist(snake);
                const orbitRadius = lerp(18, 38, this.sk.selfPreservation);
                if (nearestDist < orbitRadius) {
                    // Inside cluster — orbit by picking the less-crowded perpendicular
                    if (sdA <= sdB && clearA >= this.dangerDist * 1.05) { this._turn(snake, pA); return; }
                    if (sdB < sdA  && clearB >= this.dangerDist * 1.05) { this._turn(snake, pB); return; }
                } else {
                    // Approaching — move toward densest direction
                    if (sdA > sdFwd && sdA >= sdB && clearA >= this.dangerDist * 1.05) { this._turn(snake, pA); return; }
                    if (sdB > sdFwd && sdB > sdA  && clearB >= this.dangerDist * 1.05) { this._turn(snake, pB); return; }
                }
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

    // excludeSnake: optional snake whose body segments are ignored (used by the
    // hunt approach phase so the target's own body doesn't block the approach).
    _pathClear(snake, direction, clearance = CLEARANCE, excludeSnake = null) {
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
            if (excludeSnake !== null && hit.snake === excludeSnake) continue;
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
    _detectFoodTrail(snake, hasFreshBoost = false) {
        const sp   = snake.position;
        const W    = 7;                        // narrow corridor width
        const L    = hasFreshBoost ? 85 : 65;  // look further in fresh-boost mode
        const MIN  = hasFreshBoost ? 3 : 5;    // lower threshold near fresh kill food

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
    _snakeDensity(snake, direction, range = 320) {
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

    // ── Fresh death detection ─────────────────────────────────────────────────
    //
    //  Scans server.recentDeaths (populated by Snake.kill()) and returns info
    //  about the closest recent death within 200 units and 12 seconds.
    //  Returns null if no qualifying death exists.

    _checkFreshDeaths(snake) {
        const deaths = this.server.recentDeaths;
        if (!deaths?.length) return null;
        const now = Date.now();
        const FRESH_MS = 12000;
        const RANGE    = 320; // match the sensory window so any visible death pulls the bot
        let best = null, bestScore = -Infinity;
        for (const d of deaths) {
            const age = now - d.time;
            if (age > FRESH_MS) continue;
            const dist = MapFunctions.GetDistance(snake.position, d);
            if (dist > RANGE) continue;
            // Score: fresher and closer is better
            const score = (1 - age / FRESH_MS) * 0.6 + (1 - dist / RANGE) * 0.4;
            if (score > bestScore) { bestScore = score; best = { x: d.x, y: d.y, dist, age, score }; }
        }
        return best;
    }

    // ── Per-direction path risk score (0 = safe, 1 = very dangerous) ─────────
    //
    //  Checks for enemy snake heads inside `range` units that are in the given
    //  direction.  Head-on collisions score 1.0; crossing paths score 0.45.
    //  Used to gate food chain decisions — the bot avoids chasing food through
    //  dangerous corridors based on its selfPreservation skill.

    _pathRisk(snake, dir, range = 50) {
        const sp = snake.position;
        let risk = 0;
        for (const e of Object.values(this.client.loadedEntities)) {
            if (e.type !== Enums.EntityTypes.ENTITY_PLAYER || e === snake) continue;
            const ep = e.position;
            const dist = MapFunctions.GetDistance(sp, ep);
            if (dist > range) continue;
            const dx = ep.x - sp.x, dy = ep.y - sp.y;
            let inDir = false;
            switch (dir) {
                case D.UP:    inDir = dy > 1;  break;
                case D.DOWN:  inDir = dy < -1; break;
                case D.RIGHT: inDir = dx > 1;  break;
                case D.LEFT:  inDir = dx < -1; break;
            }
            if (!inDir) continue;
            const headOn = (dir === D.UP    && e.direction === D.DOWN)  ||
                           (dir === D.DOWN  && e.direction === D.UP)    ||
                           (dir === D.RIGHT && e.direction === D.LEFT)  ||
                           (dir === D.LEFT  && e.direction === D.RIGHT);
            const proximity = 1 - dist / range;
            risk = Math.max(risk, proximity * (headOn ? 1.0 : 0.45));
        }
        return risk;
    }

    // ── Count nearby snakes ────────────────────────────────────────────────────

    _countNearbySnakes(snake, range = 100) {
        let count = 0;
        for (const e of Object.values(this.client.loadedEntities)) {
            if (e.type !== Enums.EntityTypes.ENTITY_PLAYER || e === snake) continue;
            if (MapFunctions.GetDistance(snake.position, e.position) < range) count++;
        }
        return count;
    }

    // ── Debug logging (enabled via BOT_DEBUG=1 environment variable) ──────────
    //
    //  Logs bot state at most once per 2 seconds per bot.  Shows:
    //    mission, kill target, per-direction risk scores, food density (forward),
    //    nearby snake count, fresh death info, fresh-boost state.

    _debugLog(snake, W) {
        const now = Date.now();
        if (now - this._debugLogAt < 2000) return;
        this._debugLogAt = now;
        const fd = W.freshDeathInfo;
        console.log(
            `[BOT ${this.nickname}|${this.personality}]` +
            ` mission=${this._mission}` +
            ` target=${W.killTarget?.nick ?? 'none'}` +
            ` risk=fwd${W.riskFwd.toFixed(2)}/A${W.riskA.toFixed(2)}/B${W.riskB.toFixed(2)}` +
            ` fdFwd=${W.fdFwd}` +
            ` nearby=${this._countNearbySnakes(snake)}` +
            ` freshDeath=${fd ? `d=${fd.dist.toFixed(0)} t=${(fd.age / 1000).toFixed(1)}s` : 'none'}` +
            ` freshBoost=${W.hasFreshBoost}`
        );
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
