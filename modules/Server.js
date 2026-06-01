const https = require('https');
const IDManager       = require('./IDManager.js');
const Enums           = require('./Enums.js');
const Food            = require('./Food.js');
const Snake           = require('./Snake.js');
const MapFunctions    = require('./MapFunctions.js');
const { EntityFunctions, SnakeFunctions } = require('./EntityFunctions.js');
const Quadtree        = require('./Quadtree.js');
const Client          = require('./Client.js');
const DatabaseFunctions = require('./DatabaseFunctions.js');
const AVLTree         = require('./AVLTree.js');
const Bot             = require('./Bot.js');

const DBFunctions = new DatabaseFunctions();

// ── helpers ──────────────────────────────────────────────────────────────────

function segmentLength(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// ─────────────────────────────────────────────────────────────────────────────

class Server {
    constructor(serverInfo) {
        this.id          = serverInfo.id;
        this.name        = serverInfo.name;
        this.MaxPlayers  = serverInfo.maxplayers;
        this.pinned      = serverInfo.pinned;
        this.config      = serverInfo.config || {};
        this.config.MaxRubAcceleration  = 4;
        this.config.MaxMessagesPerSecond = 30;
        this.owner       = serverInfo.owner;
        this.type        = serverInfo.type;
        this.host        = serverInfo.host;
        this.isEphemeral = serverInfo.isEphemeral || false;

        this.entityIDs  = new IDManager();
        this.clientIDs  = new IDManager();
        this.leaderboard = new AVLTree();
        this.entityQuadtree = new Quadtree({
            x: -this.config.ArenaSize / 2,
            y: -this.config.ArenaSize / 2,
            width:  this.config.ArenaSize,
            height: this.config.ArenaSize,
        }, 10);

        this.stopped      = false;
        this.barriers     = [];
        this.chatHistory  = [];
        this.bots         = [];

        this.leaderboardDataview       = null;  // writable DataView sent to clients
        this.leaderboardDataviewOffset = 0;     // offset where per-snake personal rank is appended

        this.foodMultiplier  = 1;
        this.maxFood         = 60000;
        this.naturalFood     = 0;
        this.maxNaturalFood  = this.config.ArenaSize * 5;
        this.foodSpawnPercent = (this.config.ArenaSize ^ 2) / 10;
        this.artificialPing  = 0;

        this.king              = null;
        this.lastUpdate        = 0;
        this.lastConnectionTime = Date.now();
        this.admins            = [parseInt(this.owner)];
        this.debugGrabAmount   = 1000;
        this.entities          = [];
        this.clients           = [];
        this.snakes            = [];

        this._initBarriers(serverInfo);
        this._initBots(serverInfo);

        for (let i = 0; i < this.maxNaturalFood; i++) new Food(this);

        if (this.type === 'remote') this._startHeartbeat();

        this.start();
    }

    // ── initialisation helpers ────────────────────────────────────────────────

    _initBarriers({ config }) {
        if (!config || !config.Barriers) return;
        if (config.Barriers === 'random') {
            for (let i = 0; i < 20; i++) {
                const isTall = Math.random() > 0.5;
                const width  = isTall ? Math.random() * 100 + 5 : Math.random() * 10 + 5;
                const height = isTall ? Math.random() * 10  + 5 : Math.random() * 100 + 5;
                const half   = this.config.ArenaSize / 2;
                this.barriers.push({
                    x: Math.random() * (this.config.ArenaSize - width)  - half + width  / 2,
                    y: Math.random() * (this.config.ArenaSize - height) - half + height / 2,
                    width, height,
                });
            }
        } else {
            for (const b of config.Barriers) {
                this.barriers.push({ x: b.x, y: b.y, width: b.width, height: b.height });
            }
        }
    }

    _initBots({ config }) {
        if (config && config.Bots) {
            for (let i = 0; i < config.Bots; i++) this.bots.push(new Bot(this));
        }
    }

    _startHeartbeat() {
        const agent = new https.Agent({ keepAlive: true });
        setInterval(() => {
            const body = JSON.stringify({
                name:       this.name,
                hostname:   this.host,
                port:       this.id,
                players:    Object.keys(this.clients).length,
                maxPlayers: this.MaxPlayers,
            });
            const req = https.request({
                hostname: 'dalr.ae', port: 443, path: '/heartbeat', method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
                agent,
            }, res => { res.resume(); }); // drain response
            req.on('error', err => console.error('Heartbeat error:', err.message));
            req.write(body);
            req.end();
        }, 1000);
    }

    // ── tick loop ─────────────────────────────────────────────────────────────

    /**
     * Start the game loop.  Ticks fire every `config.UpdateInterval` ms.
     *
     * We track the *absolute* time of the next intended tick and schedule each
     * setTimeout relative to that, so timing errors never accumulate.  A tick
     * that runs long shortens the *next* sleep, not every future sleep.
     */
    start() {
        if (this.stopped) return;
        this._nextTickAt = Date.now();
        this._scheduleTick();
    }

    _scheduleTick() {
        if (this.stopped) return;
        const now   = Date.now();
        const delay = Math.max(0, this._nextTickAt - now);
        setTimeout(() => this._tick(), delay);
    }

    _tick() {
        if (this.stopped) return;
        // Advance the intended time BEFORE running the tick so that any time
        // the tick itself takes is automatically subtracted from the next sleep.
        this._nextTickAt += this.config.UpdateInterval;
        this.main();
        this._scheduleTick();
    }

    // ── per-tick game logic ───────────────────────────────────────────────────

    UpdateArena() {
        const snakeList = Object.values(this.snakes);

        for (const snake of snakeList) {
            // ── movement ──────────────────────────────────────────────────────
            const dist = snake.speed * UPDATE_EVERY_N_TICKS;
            switch (snake.direction) {
                case Enums.Directions.UP:    snake.position.y += dist; break;
                case Enums.Directions.DOWN:  snake.position.y -= dist; break;
                case Enums.Directions.LEFT:  snake.position.x -= dist; break;
                case Enums.Directions.RIGHT: snake.position.x += dist; break;
            }

            // ── visual length growth ──────────────────────────────────────────
            if (snake.actualLength > snake.visualLength) {
                snake.visualLength = Math.min(snake.actualLength, snake.visualLength + dist);
            }

            // ── boundary check ────────────────────────────────────────────────
            const half = this.config.ArenaSize / 2;
            const outOfBounds = () =>
                snake.position.x >  half || snake.position.x < -half ||
                snake.position.y >  half || snake.position.y < -half;

            if (outOfBounds()) {
                const delay = (snake.client.ping || 0) + 30;
                setTimeout(() => {
                    if (outOfBounds()) snake.kill(Enums.KillReasons.BOUNDARY, snake);
                }, delay);
            }

            // ── barrier checks ────────────────────────────────────────────────
            for (const b of this.barriers) {
                const x1 = b.x - b.width  / 2, x2 = b.x + b.width  / 2;
                const y1 = b.y - b.height / 2, y2 = b.y + b.height / 2;
                const inBarrier = () =>
                    snake.position.x > x1 && snake.position.x < x2 &&
                    snake.position.y > y1 && snake.position.y < y2;

                if (inBarrier()) {
                    const delay = (snake.client.ping || 0) + 30;
                    setTimeout(() => {
                        if (inBarrier()) snake.kill(Enums.KillReasons.BOUNDARY, snake);
                    }, delay);
                }
            }

            // ── snake-vs-snake collision + rubbing ────────────────────────────
            const secondPoint    = snake.points[0];
            // Capture the current turn-generation so the deferred check can
            // detect a turn without relying on object identity of points[0].
            // Tail-trimming replaces points[0] on single-point (freshly spawned)
            // snakes every tick, which would falsely abort kills via the old
            // `snake.points[0] !== secondPoint` guard.
            const capturedTurnGen = snake.turnGeneration;
            let   closestRub     = null;

            // Compute the head position one tick ago.  We use this short
            // "one-tick movement" segment for the INITIAL collision check
            // instead of the full [head → last-turn] segment.
            //
            // Why: the full head segment spans every tick since the snake's
            // last turn.  When snake A crosses snake B's body in the current
            // tick, B's equally-long head segment often overlaps A's body
            // because B passed through A's area in a PAST tick.  This causes
            // a spurious deferred kill for B, and whichever kill fires first
            // (based on ping) wins — letting the wrong snake die.
            //
            // Using only the one-tick movement ensures we only detect crossings
            // that actually happened in this tick, eliminating false positives
            // caused by stale segment history.
            //
            // The DEFERRED re-check still uses `secondPoint` (full segment) to
            // confirm the snake hasn't turned away and is still past the body.
            const tickDist = dist; // dist was computed above for movement
            let prevHeadX = snake.position.x;
            let prevHeadY = snake.position.y;
            switch (snake.direction) {
                case Enums.Directions.UP:    prevHeadY -= tickDist; break;
                case Enums.Directions.DOWN:  prevHeadY += tickDist; break;
                case Enums.Directions.LEFT:  prevHeadX += tickDist; break;
                case Enums.Directions.RIGHT: prevHeadX -= tickDist; break;
            }
            const prevHead = { x: prevHeadX, y: prevHeadY };

            for (const other of Object.values(snake.client.loadedEntities)) {
                if (other.type !== Enums.EntityTypes.ENTITY_PLAYER) continue;

                const nearby = SnakeFunctions.GetPointsNearSnake(snake, other, 30);
                snake.client.pointsNearby[other.id] = nearby;

                for (let i = 0; i < nearby.length - 1; i++) {
                    if (nearby[i + 1].index !== nearby[i].index + 1) continue;

                    const pt   = nearby[i].point;
                    const ptN  = nearby[i + 1].point;

                    // Rubbing
                    if (other.id !== snake.id) {
                        const nearest = MapFunctions.NearestPointOnLine(snake.position, pt, ptN);
                        if (nearest.distance < 4) {
                            if (!closestRub || nearest.distance < closestRub.distance) {
                                closestRub = { point: nearest.point, distance: nearest.distance, other };
                            }
                        }
                    }

                    // Collision
                    // Snapshot snake.position and the victim's segment endpoints
                    // so both checks use fixed geometry from this exact tick.
                    const pos     = snake.position;
                    const snapPos = { x: pos.x,  y: pos.y  };
                    const snapPt  = { x: pt.x,   y: pt.y   };
                    const snapPtN = { x: ptN.x,  y: ptN.y  };

                    // Initial check: did the snake's head cross other's body
                    // segment IN THIS TICK?  Use the one-tick movement segment
                    // [prevHead → snapPos] so we never fire on stale overlap
                    // from past ticks.
                    //
                    // includeCollinear=true: axis-aligned same-direction chases
                    // and head-on collisions produce collinear (det=0) segment
                    // pairs that DoIntersect normally skips.  The one-tick window
                    // keeps this safe — the one-tick segment can only overlap a
                    // collinear body if the head is literally inside it right now,
                    // not because of historical overlap from a past tick.
                    //
                    // Object-reference guards: prevent degenerate shared-endpoint
                    // cases (e.g. after a turn, prevHead lands exactly on
                    // snake.points[0] which is also the start of the first body
                    // segment — DoIntersect returns true for that T-touch).
                    if (pos !== ptN && secondPoint !== pt && pos !== secondPoint && pos !== pt &&
                        MapFunctions.DoIntersect(snapPos, prevHead, snapPt, snapPtN, true)) {
                        const delay = (snake.client.ping || 0) + 30;
                        setTimeout(() => {
                            if (!snake.spawned || !other.spawned) return;
                            // Walk every segment the snake has travelled since
                            // the tick when the collision was first detected.
                            // A quick multi-turn manoeuvre within the ping window
                            // must not let the snake pass through the body;
                            // a genuine dodge (all segments stay on one side)
                            // must not fire a kill.
                            //
                            // snake.points[j] for j in [0, extraTurns] are the
                            // turn points added after capturedTurnGen, newest
                            // first.  snake.points[extraTurns] is `secondPoint`
                            // (the turn point that existed at detection time).
                            const extraTurns = snake.turnGeneration - capturedTurnGen;
                            for (let j = 0; j <= extraTurns; j++) {
                                const segStart = j === 0 ? snake.position : snake.points[j - 1];
                                const segEnd   = snake.points[j] ?? (j === extraTurns ? secondPoint : null);
                                if (!segEnd) break; // safety: point was tail-trimmed
                                if (MapFunctions.DoIntersect(segStart, segEnd, snapPt, snapPtN, true)) {
                                    snake.kill(
                                        snake.id === other.id ? Enums.KillReasons.SELF : Enums.KillReasons.KILLED,
                                        other
                                    );
                                    break;
                                }
                            }
                        }, delay);
                    }
                }
            }

            if (closestRub) {
                snake.rubX = closestRub.point.x;
                snake.rubY = closestRub.point.y;
                snake.rubAgainst(closestRub.other, closestRub.distance);
                snake.rubbing = true;
            } else {
                snake.stopRubbing();
                snake.rubbing = false;
            }

            // ── eat combo decay ───────────────────────────────────────────────
            if (Date.now() - snake.lastAte > 500) snake.eatCombo = 0;

            // ── speed from eat combo ──────────────────────────────────────────
            if (snake.eatCombo >= 5 && (snake.extraSpeed + 1 <= this.config.MaxBoostSpeed || snake.speedBypass)) {
                snake.extraSpeed += 2;
                snake.speed    = 0.25 + snake.extraSpeed / 1000;
                snake.speeding = true;
            } else {
                snake.speeding = false;
            }

            if (!snake.speeding && !snake.rubbing && !snake.lockspeed && snake.extraSpeed > 0) {
                snake.extraSpeed -= 1;
                snake.speed = 0.25 + snake.extraSpeed / 1000;
            }
        }
    }

    RefreshLeaderboard() {
        // Must use a writable DataView (not an ArrayBuffer slice) because
        // Snake.updateLeaderboard() writes personal-rank bytes into it at
        // leaderboardDataviewOffset before sending the whole packet to each client.
        let offset = 0;
        const view = new DataView(new ArrayBuffer(1000));

        view.setUint8(offset, Enums.ServerToClient.OPCODE_LEADERBOARD);
        offset += 1;

        let count = 0;
        for (const { data: snakeId } of this.leaderboard.reverseOrderTraversal()) {
            const snake = this.entities[snakeId];
            if (!snake || !snake.spawned) continue;

            count++;
            snake.leaderboardPosition = count;
            if (count === 1) this.king = snake;
            if (count > 10) continue;

            view.setUint16(offset, snake.id, true);
            offset += 2;
            view.setUint32(offset, (snake.actualLength - this.config.DefaultLength) * SCORE_MULTIPLIER, true);
            offset += 4;
            for (let i = 0; i < snake.nick.length; i++) {
                view.setUint16(offset, snake.nick.charCodeAt(i), true);
                offset += 2;
            }
            view.setUint16(offset, 0, true); // null terminator
            offset += 2;
        }
        view.setUint16(offset, 0x0000, true); // list terminator
        offset += 2;

        // Store for Snake.updateLeaderboard() — it writes personal rank at this
        // offset then sends the entire view via network.send(view).
        this.leaderboardDataview       = view;
        this.leaderboardDataviewOffset = offset;
    }

    main() {
        if (this.stopped) return;

        this.UpdateArena();
        this.RefreshLeaderboard();

        // Natural food spawning
        if (Object.keys(this.entities).length < this.maxNaturalFood) {
            if (Math.random() * 100 < this.foodSpawnPercent) new Food(this);
        }

        const clientList = Object.values(this.clients);

        for (const client of clientList) {
            const snake     = client.snake;
            const isSpawned = !client.dead;

            if (!isSpawned && client.spectating) continue;

            const { entitiesToAdd, entitiesToRemove, entitiesInRadius } =
                SnakeFunctions.GetEntitiesNearClient(client);

            // Build partial-update list from currently loaded entities
            const partialEntities = [];
            for (const entity of Object.values(client.loadedEntities)) {
                if (entity.type === Enums.EntityTypes.ENTITY_PLAYER) {
                    partialEntities.push(entity);
                } else if (entity.type === Enums.EntityTypes.ENTITY_ITEM) {
                    if (entity.lastUpdate > this.lastUpdate) partialEntities.push(entity);

                    // Food proximity eat
                    if (entity.subtype === Enums.EntitySubtypes.SUB_ENTITY_ITEM_FOOD && isSpawned) {
                        const dx = snake.position.x - entity.position.x;
                        const dy = snake.position.y - entity.position.y;
                        if (dx * dx + dy * dy < 9) entity.eat(snake); // 3² = 9
                    }
                }
            }

            client.update(Enums.UpdateTypes.UPDATE_TYPE_FULL,    entitiesToAdd);
            client.update(Enums.UpdateTypes.UPDATE_TYPE_DELETE,  entitiesToRemove);
            client.update(Enums.UpdateTypes.UPDATE_TYPE_PARTIAL, partialEntities);

            if (!isSpawned) continue;

            // Push updates to spectators watching this snake's killer
            for (const [idx, killedSnake] of Object.entries(snake.killedSnakes)) {
                if (killedSnake.client.snake || !this.clients[killedSnake.client.id]) {
                    snake.client.spectating = false;
                    delete snake.killedSnakes[idx];
                    continue;
                }
                killedSnake.client.update(Enums.UpdateTypes.UPDATE_TYPE_FULL,    entitiesToAdd);
                killedSnake.client.update(Enums.UpdateTypes.UPDATE_TYPE_DELETE,  entitiesToRemove);
                killedSnake.client.update(Enums.UpdateTypes.UPDATE_TYPE_PARTIAL, partialEntities);
            }

            // Talk stamina regeneration
            if (snake.talkStamina < 255) {
                snake.talkStamina = Math.min(255, snake.talkStamina + 5);
            }

            // Trim tail to visual length
            let totalLen = 0;
            for (let i = -1; i < snake.points.length - 1; i++) {
                const a = i === -1 ? snake.position : snake.points[i];
                totalLen += segmentLength(a, snake.points[i + 1]);
            }

            while (totalLen > snake.visualLength && snake.points.length > 0) {
                const last       = snake.points[snake.points.length - 1];
                const secondLast = snake.points[snake.points.length - 2] || snake.position;
                const dir        = MapFunctions.GetNormalizedDirection(secondLast, last);
                const lastLen    = segmentLength(secondLast, last);
                const over       = totalLen - snake.visualLength;

                if (lastLen > over) {
                    // Mutate the existing tail point in-place rather than
                    // replacing it with a new object.  Replacing would change
                    // the object reference stored in snake.points[last], which
                    // for a single-point (freshly spawned) snake is also
                    // snake.points[0].  Any pending deferred-kill setTimeout
                    // that captured `secondPoint = snake.points[0]` would then
                    // see a different object and incorrectly abort the kill.
                    last.x = last.x - dir.x * over;
                    last.y = last.y - dir.y * over;
                    totalLen = snake.visualLength;
                } else {
                    totalLen -= lastLen;
                    snake.points.pop();
                }
            }

            snake.updateLeaderboard();
        }

        // Clear per-tick new-points after all clients have been sent them
        for (const client of clientList) {
            if (client.snake) client.snake.newPoints = [];
        }

        this.lastUpdate = Date.now();
    }

    // ── WebSocket attachment ──────────────────────────────────────────────────

    attachWebSocket(ws, req) {
        // Enforce player cap before doing any further work.
        // Bots set client.isBot = true and bypass this path entirely, so they
        // don't count against the limit.
        const humanCount = Object.values(this.clients).filter(c => !c.isBot).length;
        if (this.MaxPlayers && humanCount >= this.MaxPlayers) {
            ws.close(1008, 'Server is full');
            return;
        }

        this.lastConnectionTime = Date.now();

        // Queue messages received before session lookup completes
        const queue = [];
        const enqueue = msg => queue.push(msg);
        ws.on('message', enqueue);

        const finalize = (user) => {
            const client = new Client(this, ws, user || null);

            // Replay queued messages
            for (const msg of queue) {
                const view = new DataView(new Uint8Array(msg).buffer);
                client.RecieveMessage(view.getUint8(0), view).catch(err => {
                    console.error(`[WS] Error replaying queued message:`, err.message);
                });
            }
            ws.off('message', enqueue);

            ws.on('message', msg => {
                const view = new DataView(new Uint8Array(msg).buffer);
                // RecieveMessage is async — without .catch() any thrown exception
                // becomes an unhandled promise rejection that crashes Node.js 15+.
                client.RecieveMessage(view.getUint8(0), view).catch(err => {
                    console.error(`[WS] Unhandled error from client ${client.id}:`, err.message);
                    try { ws.close(1011, 'Internal error'); } catch {}
                });
            });

            ws.on('close', () => {
                if (client.snake && client.snake.id) {
                    client.snake.kill(Enums.KillReasons.LEFT_SCREEN, client.snake);
                }
                this.clientIDs.releaseID(client.id);
                delete this.clients[client.id];
                this.lastConnectionTime = Date.now();
            });
        };

        // Try to resolve session cookie
        const cookies = req.headers.cookie || '';
        const match   = cookies.split(';').find(c => c.trim().startsWith('session_id='));
        const session = match ? match.trim().split('=')[1] : null;

        if (session) {
            DBFunctions.GetUserFromSession(session)
                .then(finalize)
                .catch(err => {
                    console.error('Session lookup error:', err);
                    ws.close();
                });
        } else {
            finalize(null);
        }
    }

    // ── admin helpers ─────────────────────────────────────────────────────────

    addAdmin(userId) {
        const id = parseInt(userId);
        if (!isNaN(id) && !this.admins.includes(id)) {
            this.admins.push(id);
            return true;
        }
        return false;
    }

    removeAdmin(userId) {
        const id  = parseInt(userId);
        const idx = this.admins.indexOf(id);
        if (idx !== -1 && id !== parseInt(this.owner)) {
            this.admins.splice(idx, 1);
            return true;
        }
        return false;
    }

    // ── lifecycle ─────────────────────────────────────────────────────────────

    Stop() {
        this.stopped = true;
        for (const bot of this.bots) {
            try { bot.destroy(); } catch (e) { console.error('Error destroying bot:', e); }
        }
        this.bots = [];
        for (const client of Object.values(this.clients)) {
            try {
                if (client.ws && client.ws.readyState === 1) {
                    client.ws.close(1000, 'Server shutting down');
                }
            } catch (e) {
                console.error('Error closing client socket:', e);
            }
        }
    }

    destroy() {
        this.Stop();
        delete Servers[this.id];
        if (global.ephemeralServers) global.ephemeralServers.delete(parseInt(this.owner));
        console.log(`Ephemeral server ${this.id} (${this.name}) destroyed.`);
    }
}

module.exports = Server;
