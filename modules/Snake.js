const Enums = require("./Enums.js");
const MapFunctions = require("./MapFunctions.js");
const { EntityFunctions, SnakeFunctions } = require("./EntityFunctions.js");
const GlobalFunctions = require("./GlobalFunctions.js")
const Food = require("./Food.js");
const AVLTree = require("./AVLTree.js");
const IDManager = require("./IDManager.js");

// ── Skin → food colour model ────────────────────────────────────────────────
//
// Death-drop food is coloured to match what the snake actually looked like at
// the body position the food dropped from. Most skins are gradients drawn from
// head (t=0) to tail (t=1); we mirror those gradients here as RGB stops so the
// server can pick the right colour per food. Keys match how a skin is assigned
// client-side: the exact customPlayerColors name, or the 'demogorgon' nick.
// A snake with no skin just uses its own hue (so its food matches its colour).
const SKIN_GRADIENTS = {
    'demogorgon':   [[0, [0, 0, 0]]],                       // all black
    'Dracula':      [[0, [0, 0, 0]]],                       // black body
    'Sun':          [[0, [227, 182, 18]]],                  // golden
    'Void':         [[0, [110, 0, 255]], [1, [60, 0, 140]]],
    'Laser':        [[0, [0, 255, 255]]],                   // cyan
    'Matrix':       [[0, [0, 255, 60]]],                    // green
    'Pastel':       [[0, [255, 0, 180]], [0.5, [0, 255, 255]], [1, [255, 230, 0]]],
    'Gold':         [[0, [255, 180, 0]], [0.35, [255, 255, 180]], [0.7, [180, 90, 0]], [1, [255, 220, 80]]],
    'Fire And Ice': [[0, [255, 50, 0]], [0.45, [255, 220, 80]], [0.55, [180, 240, 255]], [1, [0, 160, 255]]],
    // 'Rainbow' is handled specially (full spectrum along the body).
};

function packRGB(r, g, b) {
    return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

// HSL→RGB with the food's fixed saturation/lightness (matches the old
// hsl(hue,100%,50%) rendering so normal-snake food looks unchanged).
function hueToRGB(hue) {
    const h = (((hue % 360) + 360) % 360) / 360;
    const s = 1, l = 0.5;
    const k = n => (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return packRGB(Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255));
}

// Interpolate an array of [stop, [r,g,b]] gradient stops at t∈[0,1].
function gradientAt(stops, t) {
    t = Math.max(0, Math.min(1, t));
    if (stops.length === 1) return packRGB(...stops[0][1]);
    for (let i = 0; i < stops.length - 1; i++) {
        const [s0, c0] = stops[i], [s1, c1] = stops[i + 1];
        if (t >= s0 && t <= s1) {
            const f = s1 === s0 ? 0 : (t - s0) / (s1 - s0);
            return packRGB(
                Math.round(c0[0] + (c1[0] - c0[0]) * f),
                Math.round(c0[1] + (c1[1] - c0[1]) * f),
                Math.round(c0[2] + (c1[2] - c0[2]) * f),
            );
        }
    }
    return packRGB(...stops[stops.length - 1][1]);
}


class Snake {
    network = null;
    nick = "";
    type = Enums.EntityTypes.ENTITY_PLAYER;

    constructor(network, name) {
        this.client = network;
        this.server = network.server;
        this.network = network.socket;
        this.user = network.user || null;
        this.client.dead = false;
        this.client.spectating = false;
        this.leaderboardPosition = 0;
        this.SnakesRubbingAgainst = [];

        //this.flags |= Enums.EntityFlags.DEBUG
        this.flags = 0;
        if (customPlayerColors[name]) {
            this.customHead = customPlayerColors[name].customHead;
            this.customBody = customPlayerColors[name].customBody;
            this.customTail = customPlayerColors[name].customTail;
            this.flags |= Enums.EntityFlags.CUSTOM_COLOR;
        }
        // Set verified badge if the chosen nick matches the user's registered verified name
        if (this.user && this.user.verified_name && name === this.user.verified_name) {
            this.flags |= Enums.EntityFlags.VERIFIED;
        }

        let thisId = this.server.entityIDs.allocateID();
        //console.log("Spawning snake " + name + " with ID " + thisId)
        this.spawned = true;
        this._spawnTime = Date.now();
        var Bit8 = new DataView(new ArrayBuffer(1000));
        Bit8.setUint8(0, Enums.ServerToClient.OPCODE_ENTERED_GAME);
        Bit8.setUint32(1, thisId, true);
        this.id = thisId;
        this.nick = name
        let randomPos = MapFunctions.GetFreePosition(this.server);
        this.position = { x: randomPos.x, y: randomPos.y };
        this.direction = Enums.Directions.UP;
        this.speed = 0.25;
        this.speedBypass = false;
        this.extraSpeed = 0;
        this.killstreak = 0;
        this.points = [{x: this.position.x, y: this.position.y}];
        this.newPoints = [];
        // Incremented by addPoint() on every turn.  Deferred collision checks
        // compare this against the value captured at schedule time to detect
        // whether the snake has turned (dodged) without relying on points[0]
        // object identity, which tail-trimming can invalidate.
        this.turnGeneration = 0;
        // Axis-aligned segment index handles.
        // _headSegHandle  — the live head segment [position → points[0]].
        //                   Refreshed every tick and after every turn.
        // _bodySegHandles — completed body segments [points[i] → points[i+1]],
        //                   newest first (index 0 = adjacent to head, last = tail).
        //                   Registered on turn, removed when the tail consumes them.
        this._headSegHandle  = null;
        this._bodySegHandles = [];
        this.talkStamina = 255;
        this.color = Math.random() * 360;
        this.eatCombo = 0;
        this.visualLength = this.server.config.DefaultLength;
        this.actualLength = this.server.config.DefaultLength;
        this.killedSnakes = [];
        this.server.leaderboard.insert(this.length, this.id);



        this.server.snakes[this.id] = this;
        this.server.entities[this.id] = this;


        this.network.send(Bit8);
    }
    get length() {
        return this.actualLength;
    }
    set length(value) {
        this.server.leaderboard.deleteByValue(this.id);
        this.actualLength = value;
        this.server.leaderboard.insert(this.actualLength, this.id);

    }

    updateLeaderboard() {
        /*const BitView = new DataView(new ArrayBuffer(1000));
        let offset = 0;
        BitView.setUint8(offset, Enums.ServerToClient.OPCODE_LEADERBOARD);
        offset += 1;
        for (let pair of this.server.leaderboard.reverseOrderTraversal()) {
            count++;
            let snake = this.server.entities[pair.data]
            if (!snake || !snake.spawned)
                continue
            if (snake.id == this.id)
                myRank = count;
            if (count > 10)
                continue
            if (count == 1)
                this.server.king = snake;
            if (!snake.nick)
                continue
            BitView.setUint16(offset, snake.id, true);
            offset += 2;
            BitView.setUint32(offset, (snake.actualLength - this.server.config.DefaultLength) * SCORE_MULTIPLIER, true);
            offset += 4;
            BitView, offset = GlobalFunctions.SetNick(BitView, offset, snake.nick)
            BitView.setUint16(offset, 0, true);
        }
        BitView.setUint16(offset, 0x0, true);
        offset += 2;
        if (myRank) {
            BitView.setUint16(offset, this.id, true);
            offset += 2;
            BitView.setUint32(offset, (this.length - this.server.config.DefaultLength) * SCORE_MULTIPLIER, true);
            offset += 4;
            BitView.setUint16(offset, myRank, true);
            offset += 2;
        }
        this.network.send(BitView)*/
        let view  = this.server.leaderboardDataview
        let offset = this.server.leaderboardDataviewOffset
        if (this.leaderboardPosition > 0) {
            view.setUint16(offset, this.id, true);
            offset += 2;
            view.setUint32(offset, (this.length - this.server.config.DefaultLength) * SCORE_MULTIPLIER, true);
            offset += 4;
            view.setUint16(offset, this.leaderboardPosition, true);
            offset += 2;
        }
        this.network.send(view)

    }
    addPoint(x, y) {
        // Increment before the unshift so any code that reads
        // turnGeneration immediately after addPoint() sees the new value.
        this.turnGeneration = (this.turnGeneration || 0) + 1;

        // ── segment index maintenance ─────────────────────────────────────
        // The old head segment [position → points[0]] is now a completed body
        // segment.  Remove it from the head slot and register it as a body
        // segment [new-turn-point → old-points[0]] so it becomes static.
        // The new head segment starts zero-length at the turn point and will
        // be inserted on the next _refreshHeadSeg() call (at the end of turn()
        // and on every subsequent UpdateArena tick).
        if (this.server?.segmentIndex && this.points.length > 0) {
            const oldP0 = this.points[0];
            this.server.segmentIndex.remove(this._headSegHandle);
            this._headSegHandle = null;
            const handle = this.server.segmentIndex.insert(this, x, y, oldP0.x, oldP0.y);
            if (handle) this._bodySegHandles.unshift(handle); // newest at front
        }

        this.points.unshift({ x: x, y: y });
        this.newPoints.push({ x: x, y: y });
    }

    /** Re-register the head segment [position → points[0]] in the index. */
    _refreshHeadSeg() {
        if (!this.server?.segmentIndex || !this.points.length) return;
        this.server.segmentIndex.remove(this._headSegHandle);
        this._headSegHandle = this.server.segmentIndex.insert(
            this,
            this.position.x, this.position.y,
            this.points[0].x, this.points[0].y
        );
    }
    turn(direction, vector) {
        if (!Number.isFinite(vector)) return;
        if (direction !== Enums.Directions.UP && direction !== Enums.Directions.DOWN &&
            direction !== Enums.Directions.LEFT && direction !== Enums.Directions.RIGHT) return;
        let whatVector, oppositeVector;
        if (direction == Enums.Directions.UP || direction == Enums.Directions.DOWN) {
            whatVector = "x";
            oppositeVector = "y";
        } else {
            whatVector = "y";
            oppositeVector = "x";
        }
        if (this.direction == direction || this.direction + 2 == direction || this.direction - 2 == direction) { // If the direction is the same or opposite
            return;
        }
        let goingUp = direction == Enums.Directions.UP || direction == Enums.Directions.RIGHT;
        let secondPoint = this.points[0];
        if (Math.abs(secondPoint[whatVector] - vector) < 0.1) { // Attempting to turn in place
            this.position[oppositeVector] += goingUp ? 0.22 : -0.22;
        }

        // ── teleport prevention ───────────────────────────────────────────────
        // The snake was travelling on oppositeVector, so whatVector should not
        // have changed since the last turn.  Allow a generous delta (8 ticks of
        // movement) to absorb any client/server prediction drift, but reject
        // coordinates that are clearly exploit-range values.
        const maxTurnDelta = Math.max(3, this.speed * UPDATE_EVERY_N_TICKS * 8);
        vector = Math.max(this.position[whatVector] - maxTurnDelta,
                 Math.min(this.position[whatVector] + maxTurnDelta, vector));

        this.position[whatVector] = vector;

        // Scan the body at turn time — but DON'T kill synchronously.
        //
        // Why deferred?  By the time a turn input reaches the server the snake's
        // server-side position has already advanced ~ping ms worth of movement
        // past where the client believes they are.  The full head segment
        // [turn_point → last_turn_point] therefore spans across bodies that the
        // player was legitimately turning away from on their screen.  Killing
        // immediately would kill them "before they even touched" from the client's
        // perspective.
        //
        // Instead we apply the same latency-compensation logic used by
        // UpdateArena(): schedule the kill for (ping + 30 ms) in the future and
        // re-check with the snake's LIVE position at that time.  By then the
        // snake is moving in the NEW direction.  If it turned away from the body,
        // that live segment will no longer cross it → kill aborted.  If it moved
        // into a body (e.g. turned directly into it), the live segment will still
        // cross → kill fires.
        //
        // The dodge guard uses turnGeneration (captured AFTER addPoint so it
        // reflects this turn) rather than points[0] object identity: tail-trimming
        // can replace points[0] for single-point snakes without incrementing
        // turnGeneration, which would otherwise falsely abort the kill.
        let pendingKill = null;

        if (secondPoint) {
            const snapHead   = { x: this.position.x, y: this.position.y };
            const snapSecond = { x: secondPoint.x,   y: secondPoint.y   };

            // Query the segment index for everything the full head segment
            // [snapHead → snapSecond] crosses.  This replaces the O(N × L)
            // brute-force scan with an O(1) index lookup.
            const hits = this.server.segmentIndex.queryLine(
                snapHead.x, snapHead.y, snapSecond.x, snapSecond.y
            );

            for (const hit of hits) {
                const other = hit.snake;

                // Skip our own head segment (the index still holds the old
                // head segment from before this turn) and the first body
                // segment (which shares secondPoint as an endpoint and would
                // produce a false T-intersection hit).
                if (other === this) {
                    if (hit.id === this._headSegHandle?.id)       continue;
                    if (hit.id === this._bodySegHandles[0]?.id)   continue;
                }

                // Snapshot the hit segment's endpoints for the deferred check.
                const snapP  = hit.isH ? { x: hit.xMin, y: hit.y    } : { x: hit.x, y: hit.yMin };
                const snapNP = hit.isH ? { x: hit.xMax, y: hit.y    } : { x: hit.x, y: hit.yMax };

                pendingKill = {
                    reason: other === this ? Enums.KillReasons.SELF : Enums.KillReasons.KILLED,
                    victim: other,
                    snapP,
                    snapNP,
                    // snapSecond: after addPoint() shifts points[], secondPoint ends up at
                    // points[extraTurns + 1].  The deferred check extends to j = extraTurns+1
                    // to include the segment [trigger-turn-point → secondPoint], which is the
                    // segment the initial detection actually fired on.
                    snapSecond,
                };
                break;
            }
        }

        this.direction = direction;
        this.addPoint(this.position.x, this.position.y);
        // addPoint() just incremented turnGeneration, so capture it now.
        // The deferred check will abort if another turn fires before the delay.
        if (pendingKill) {
            const capturedGen = this.turnGeneration;
            const self        = this;
            const { reason, victim, snapP, snapNP, snapSecond } = pendingKill;
            const delay = (this.client.ping || 0) + 30;
            setTimeout(() => {
                if (!self.spawned || !victim.spawned) return;
                // Walk every segment the snake has travelled since the turn
                // that triggered this check.
                //
                // CRITICAL: the initial scan detected a crossing on the segment
                // [snapHead → secondPoint] (the full head segment at turn time).
                // addPoint() stored snapHead as points[0], pushing secondPoint to
                // points[1].  After k further turns:
                //   points[k]   = trigger-turn point  (capturedGen)
                //   points[k+1] = secondPoint          (capturedGen - 1)
                //
                // So the loop must go to j = extraTurns + 1 to include the
                // segment [trigger-turn-point → secondPoint] — the one where the
                // original crossing actually occurred.  Without the +1, a snake
                // that crossed the body and then turned would skip that segment
                // entirely and pass through.
                //
                // A genuine dodge (snapHead was BEFORE the body → DoIntersect
                // returned false → pendingKill was never set) never reaches here.
                const extraTurns = self.turnGeneration - capturedGen;
                for (let j = 0; j <= extraTurns + 1; j++) {
                    const segStart = j === 0 ? self.position : self.points[j - 1];
                    // For the final step, fall back to the snapshot of secondPoint
                    // in case points[extraTurns + 1] was tail-trimmed.
                    const segEnd = self.points[j] ?? (j === extraTurns + 1 ? snapSecond : null);
                    if (!segEnd) break;
                    if (MapFunctions.DoIntersect(segStart, segEnd, snapP, snapNP, true)) {
                        self.kill(reason, reason === Enums.KillReasons.SELF ? self : victim);
                        return;
                    }
                }
            }, delay);
        }

        // Compensate for the full round-trip latency (not just ping/2).
        // The client predicts GlobalWebLag ms ahead. By the time the client RECEIVES
        // the server confirmation, a full RTT has elapsed. So advance by
        // (ping - GlobalWebLag), not (ping/2 - GlobalWebLag).
        // Cap extraLatency: a client with artificially delayed PONG responses can
        // inflate this.client.ping and jump their snake forward by an unbounded
        // distance on every turn event.
        const totalSpeed   = this.speed * UPDATE_EVERY_N_TICKS;
        const extraLatency = Math.min(500,
            Math.max(0, this.client.ping - this.server.config.GlobalWebLag));
        const totalDistanceTraveledDuringPing =
            totalSpeed * (extraLatency / this.server.config.UpdateInterval);
        if (goingUp)
            this.position[oppositeVector] += totalDistanceTraveledDuringPing;
        else
            this.position[oppositeVector] -= totalDistanceTraveledDuringPing;

        // Register the new head segment now that position has its final value
        // (snap coordinate + latency advance).  UpdateArena refreshes it every
        // tick from here on.
        this._refreshHeadSeg();
    }
    rubAgainst(snake, distance) {
        this.flags |= Enums.EntityFlags.IS_RUBBING;
        this.RubSnake = snake;
        snake.SnakesRubbingAgainst.push(this);

        let max_speed = (this.server.config.MaxRubAcceleration-1);
        let dist = Math.max(distance, 1);
        let percentOfMax = (4 - dist + 1) / 4;



        let rubSpeed = max_speed * percentOfMax;
        if (this.extraSpeed + rubSpeed <= this.server.config.MaxRubSpeed || this.speedBypass) {
            this.extraSpeed += rubSpeed
            this.speed += rubSpeed / 1000;
        }

    }
    stopRubbing() {
        if (!this.RubSnake)
            return;
        this.RubSnake.SnakesRubbingAgainst = this.RubSnake.SnakesRubbingAgainst.filter((snake) => snake != this);
        this.RubSnake = undefined;
        this.flags &= ~Enums.EntityFlags.IS_RUBBING;
    }

    // Packed-RGB colour of this snake at body fraction t (0 = head, 1 = tail).
    // Skinned snakes follow their gradient; plain snakes use their own hue.
    colorAt(t) {
        if (this.nick === 'Rainbow') return hueToRGB((t * 360) % 360);
        const stops = SKIN_GRADIENTS[this.nick];
        if (stops) return gradientAt(stops, t);
        return hueToRGB(this.color);
    }

    kill(reason, killedBy) {
        if (this.invincible && reason != Enums.KillReasons.LEFT_SCREEN)
            return;
        // Guard: multiple deferred collision checks can resolve simultaneously.
        // Without this, killstreak, kill packets, and spectator state are
        // all applied twice.
        if (!this.spawned)
            return;

        // Remove all segments from the spatial index immediately so that no
        // other snake can collide with this snake's body after it dies.
        if (this.server?.segmentIndex) {
            this.server.segmentIndex.remove(this._headSegHandle);
            for (const handle of this._bodySegHandles)
                this.server.segmentIndex.remove(handle);
            this._headSegHandle  = null;
            this._bodySegHandles = [];
        }
        if (killedBy != this) {
            if (!killedBy)
                return
            if (killedBy.client.dead) {
                return
            }
            killedBy.killstreak += 1;
            if (killedBy.killstreak >= 8) {
                killedBy.flags |= Enums.EntityFlags.KILLSTREAK;
                let oldKillstreak = killedBy.killstreak;
                setTimeout(() => {
                    if (!killedBy)
                        return
                    if (killedBy.killstreak == oldKillstreak)
                        killedBy.flags &= ~Enums.EntityFlags.KILLSTREAK;
                }, 5000)
            }
            if (this.server.king && this.server.king == this) {
                killedBy.flags |= Enums.EntityFlags.KILLED_KING;
                setTimeout(() => {
                    if (!killedBy)
                        return
                    killedBy.flags &= ~Enums.EntityFlags.KILLED_KING;
                }, 5000)
            }

            // Send "Killed"
            var Bit8 = new DataView(new ArrayBuffer(16 + 2 * 1000));
            Bit8.setUint8(0, Enums.ServerToClient.OPCODE_EVENTS);
            var offset = 1;
            Bit8.setUint8(offset, Enums.EventCodes.EVENT_DID_KILL, true);
            offset += 1;
            Bit8.setUint16(offset, 0, true); //(ID?), unused.
            offset += 2;
            Bit8, offset = GlobalFunctions.SetNick(Bit8, offset, this.nick)
            killedBy.network.send(Bit8);
            // Send "Killed By"
            var Bit8 = new DataView(new ArrayBuffer(16 + 2 * 1000));
            Bit8.setUint8(0, Enums.ServerToClient.OPCODE_EVENTS);
            var offset = 1;
            Bit8.setUint8(offset, Enums.EventCodes.EVENT_WAS_KILLED, true);
            offset += 1;
            Bit8.setUint16(offset, 0, true); //(ID?), unused.
            offset += 2;
            Bit8, offset = GlobalFunctions.SetNick(Bit8, offset, killedBy.nick)
            this.network.send(Bit8);
        }
        // Update other snakes

        // Remove all the snakes that were rubbing against this snake
        for (let snake of this.SnakesRubbingAgainst) {
            snake.stopRubbing();
        }
        this.stopRubbing();

        if (!this.spawned) {
            return
        }
        Object.values(this.server.clients).forEach((client) => {
            if (client.loadedEntities[this.id]) {
                var Bit8 = new DataView(new ArrayBuffer(16 + 2 * 1000));
                Bit8.setUint8(0, Enums.ServerToClient.OPCODE_ENTITY_INFO);
                var offset = 1;

                Bit8.setUint16(offset, this.id, true);
                offset += 2;
                //console.log("0Killed snake " + this.nick + " with ID " + this.id)
                Bit8.setUint8(offset, Enums.UpdateTypes.UPDATE_TYPE_DELETE, true);
                offset += 1;
                if (killedBy == this) {
                    Bit8.setUint16(offset, 0, true);
                } else {
                    Bit8.setUint16(offset, killedBy.id, true);
                }
                offset += 2;
                Bit8.setUint8(offset, reason);
                offset += 1;
                Bit8.setFloat32(offset, this.position.x, true); //Kill position X
                offset += 4;
                Bit8.setFloat32(offset, this.position.y, true); //Kill position Y
                offset += 4;

                // King
                Bit8.setUint16(offset, 0, true);
                offset += 2;
                Bit8.setUint16(offset, this.server.king && this.server.king.id || 0, true);
                offset += 2;
                Bit8.setFloat32(offset, this.server.king && this.server.king.position.x || 0, true);
                offset += 4;
                Bit8.setFloat32(offset, this.server.king && this.server.king.position.y || 0, true);
                offset += 4;
                client.socket.send(Bit8);
                delete client.loadedEntities[this.id]
            }
        });


        // Convert snake to food


        let actualLength = 0
        for (let i = -1; i < this.points.length - 1; i++) {
          let point;
          if (i == -1) point = this.position;
          else point = this.points[i];
          let nextPoint = this.points[i + 1];

          let segmentLength = SnakeFunctions.GetSegmentLength(point, nextPoint);
          actualLength += segmentLength;
        }

        function customEasing(t) {
            const a = 8;
            return 1 - Math.exp(-a * t);
        }

        function easeOut(entity, targetPosition, duration) {
            const startX = entity.position.x;
            const startY = entity.position.y;
            const deltaX = targetPosition.x - startX;
            const deltaY = targetPosition.y - startY;
            const fps = 60;
            const frameDuration = 1000 / fps;
            let startTime = null;
            const animate = (timestamp) => {
                if (!entity || !entity.position) return;
                if (!startTime) startTime = timestamp;
                const elapsed = timestamp - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easedProgress = customEasing(progress);
                entity.position.x = startX + deltaX * easedProgress;
                entity.position.y = startY + deltaY * easedProgress;
                entity.lastUpdate = Date.now();
                if (progress < 1) {
                    setTimeout(() => animate(performance.now()), frameDuration);
                }
            };
            animate(performance.now());
        }



        let scoreToDrop = SnakeFunctions.GetScoreToDrop(actualLength);
        let foodToDrop = SnakeFunctions.ScoreToFood(scoreToDrop) * this.server.foodMultiplier;

        // Anti-bot: snakes that die very quickly drop little or no food,
        // directly defeating food-farm bots that suicide immediately after spawning.
        //   < 3 s alive  → 0 % food (pure bot behaviour)
        //   3–10 s alive → 25 % food (likely still botting)
        //   ≥ 10 s alive → 100 % (normal player)
        const aliveMs = Date.now() - (this._spawnTime || 0);
        if (aliveMs < 3_000) {
            foodToDrop = 0;
        } else if (aliveMs < 10_000) {
            foodToDrop = Math.floor(foodToDrop * 0.25);
        }

        foodToDrop = Math.min(foodToDrop, Math.max(0, Food.HARD_ENTITY_LIMIT - Object.keys(this.server.entities).length));
        let dropAtInterval = foodToDrop > 0 ? actualLength / foodToDrop : Infinity;
        for (let i = 0; i < actualLength && foodToDrop > 0; i += dropAtInterval) {
            let point = SnakeFunctions.GetPointAtDistance(this, i);
            let nextPoint
            if (i == actualLength-1)
                nextPoint = this.position;
            else
                nextPoint = SnakeFunctions.GetPointAtDistance(this, i + 1);
            // Colour each food to match the snake at this body position
            // (t: 0 = head … 1 = tail), so skins like Fire And Ice fade red→blue
            // and Demogorgon drops pure black.
            let t = actualLength > 0 ? i / actualLength : 0;
            let food = new Food(this.server, point.x, point.y, this.color, this, 20000 + (Math.random() * 60 * 1000 * 5), false, this.colorAt(t));

            // Move food forward the direction that the line was going

            let direction = MapFunctions.GetNormalizedDirection(nextPoint, point);

            if (direction) {
                let amountDispersion = 2;
                let speedMultiplier = 2;
                let easingRandomX = (Math.random() * (amountDispersion))-amountDispersion/2;
                easingRandomX += (direction.x * this.speed * UPDATE_EVERY_N_TICKS * speedMultiplier);
                let easingRandomY = (Math.random() * (amountDispersion))-amountDispersion/2;
                easingRandomY += (direction.y * this.speed * UPDATE_EVERY_N_TICKS * speedMultiplier);
                easeOut(food, { x: point.x + easingRandomX, y: point.y + easingRandomY }, 5000);
            }
        }

        let entitiesToAdd = []
        let entitiesToRemove = []
        if (killedBy != this) {
            this.client.killedBy = killedBy
            killedBy.killedSnakes.push(this)
            this.client.spectating = killedBy;
            // Sync up the loaded entities

            Object.values(killedBy.client.loadedEntities).forEach((entity) => {
                if (entity.id == this.id) {
                    return
                }
                if (!this.client.loadedEntities[entity.id]) {
                    entitiesToAdd.push(entity)
                }
            })
            Object.values(this.client.loadedEntities).forEach((entity) => {
                if (entity.id == killedBy.id) {
                    return
                }
                if (!killedBy.client.loadedEntities[entity.id]) {
                    entitiesToRemove.push(entity)
                }
            })
            this.client.update(Enums.UpdateTypes.UPDATE_TYPE_DELETE, entitiesToRemove);
            this.client.update(Enums.UpdateTypes.UPDATE_TYPE_FULL, entitiesToAdd);

        }
        this.killedSnakes.forEach((snake, index) => {
            if (snake.client.snake || !this.server.clients[snake.client.id]) {// If the snake respawned or disconnected, remove it from the list
                snake.client.spectating = false;
                delete this.killedSnakes[index]
                return
            }
            if (killedBy == this) { // No more snakes to spectate
                snake.client.deadPosition = this.position
                snake.client.spectating = false;
            }
            else {
                snake.client.spectating = this;
                snake.client.update(Enums.UpdateTypes.UPDATE_TYPE_DELETE, [entitiesToRemove]);
                snake.client.update(Enums.UpdateTypes.UPDATE_TYPE_FULL, [entitiesToAdd]);
            }
        })
        // Transfer spectating snakes to the killer. Guard against self-kill:
        // killedBy === this would double the array.
        if (killedBy !== this) {
            killedBy.killedSnakes = killedBy.killedSnakes.concat(this.killedSnakes);
        }

        // Anti-bot: notify client so it can apply progressive re-entry cooldown
        if (this.client && typeof this.client._onSnakeDied === 'function') {
            this.client._onSnakeDied();
        }

        // Record death position so bots can detect fresh kill food
        if (!this.server.recentDeaths) this.server.recentDeaths = [];
        this.server.recentDeaths.push({ x: this.position.x, y: this.position.y, time: Date.now() });
        if (this.server.recentDeaths.length > 30) this.server.recentDeaths.shift();

        this.spawned = false;
        this.client.deadPosition = this.position;
        this.client.dead = true;
        this.client.snake = undefined;
        this.server.leaderboard.deleteByValue(this.id);
        setTimeout(() => {
            this.server.entityIDs.releaseID(this.id);
        }, 1000);
        delete this.server.snakes[this.id];
        delete this.server.entities[this.id]

    }

    debugCircleIds = new IDManager();
    DrawDebugCircle(x, y, color = 100, size = 4) {
        let id = this.debugCircleIds.allocateID();
        var Bit8 = new DataView(new ArrayBuffer(49));
        var offset = 0;
        Bit8.setUint8(offset, 0xa7);
        offset += 1;
        Bit8.setUint16(offset, id, true);
        offset += 2;
        Bit8.setUint8(offset, 1, true);
        offset += 1;
        Bit8.setFloat32(offset, x, true);
        offset += 4;
        Bit8.setFloat32(offset, y, true);
        offset += 4;
        Bit8.setUint16(offset, color, true);
        offset += 2;
        Bit8.setUint8(offset, size, true);
        this.network.send(Bit8);
        return id
    }
    DeleteDebugCircle(circle) {
        this.debugCircleIds.releaseID(circle);
        var Bit8 = new DataView(new ArrayBuffer(49));
        var offset = 0;
        Bit8.setUint8(offset, 0xa7);
        offset += 1;
        Bit8.setUint8(offset, circle, true);
        offset += 1;
        Bit8.setUint16(offset, 0, true);
        this.network.send(Bit8);
    }
    DeleteAllDebugCircles() {
        for (let id of this.debugCircleIds.allocatedIDs) {
            this.DeleteDebugCircle(id)
        }
    }
    Talk(id) {
        this.flags &= ~Enums.EntityFlags.SHOW_CUSTOM_TALKING;
        this.flags |= Enums.EntityFlags.SHOW_TALKING;
        this.talkId = id;
        let oldTalkId = id;
        setTimeout(() => {
            if (this.talkId == oldTalkId)
                this.flags &= ~Enums.EntityFlags.SHOW_TALKING;
        }, 5000)

    }


}

module.exports = Snake;
