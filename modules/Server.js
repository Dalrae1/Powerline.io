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
const SegmentIndex    = require('./SegmentIndex.js');

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
        // Dev mode: when the whole Node process runs with DEV_SKIP_AUTH enabled
        // (local development), authentication is bypassed and EVERY user on EVERY
        // server is treated as a full Developer (level 3). Production servers
        // (DEV_SKIP_AUTH unset) keep normal rank-based permissions.
        this.isDevServer = process.env.DEV_SKIP_AUTH === 'true';
        // How long an idle ephemeral server lives before auto-deletion. Settable
        // by a developer via the `setservertime` command (default 1 hour).
        this.ephemeralLifetimeMs = 60 * 60 * 1000;

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
        // In-memory moderation state (per server, cleared on restart).
        // bannedIPs / bannedUsers gate reconnection; mutes are tracked per live
        // Client (client.muted) since they only matter while connected.
        this.bannedIPs    = new Set();
        this.bannedUsers  = new Set(); // userids
        // Axis-aligned segment index — O(1) collision and rubbing queries.
        this.segmentIndex = new SegmentIndex();

        this.leaderboardDataview       = null;  // writable DataView sent to clients
        this.leaderboardDataviewOffset = 0;     // offset where per-snake personal rank is appended

        // Honour config overrides when provided (custom servers set these at
        // creation); otherwise fall back to the historical defaults.
        this.foodMultiplier  = this.config.FoodMultiplier || 1;
        this.maxFood         = 60000;
        this.naturalFood     = 0;
        this.maxNaturalFood  = this.config.MaxNaturalFood || this.config.ArenaSize * 5;
        this.foodSpawnPercent = (this.config.ArenaSize ^ 2) / 10;
        this.artificialPing  = 0;

        this.king              = null;
        this.lastUpdate        = 0;
        this.lastConnectionTime = Date.now();
        // Leaderboard is expensive to rebuild (full AVL traversal) so we only
        // refresh it every N ticks rather than every single tick.
        this._ticksSinceLeaderboard = 0;
        this.admins            = [parseInt(this.owner)];
        this.debugGrabAmount   = 1000;
        this.entities          = [];
        this.entityCount       = 0;
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
                hostname: 'dalr.ae', port: 443, path: '/api/heartbeat', method: 'POST',
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
            // Frozen snakes (admin "freeze") don't advance: dist 0 keeps the head
            // in place and makes the collision query a zero-length no-op.
            const dist = snake.frozen ? 0 : snake.speed * UPDATE_EVERY_N_TICKS;
            switch (snake.direction) {
                case Enums.Directions.UP:    snake.position.y += dist; break;
                case Enums.Directions.DOWN:  snake.position.y -= dist; break;
                case Enums.Directions.LEFT:  snake.position.x -= dist; break;
                case Enums.Directions.RIGHT: snake.position.x += dist; break;
            }

            const posBound = this.config.ArenaSize;
            snake.position.x = Number.isFinite(snake.position.x) ? Math.max(-posBound, Math.min(posBound, snake.position.x)) : 0;
            snake.position.y = Number.isFinite(snake.position.y) ? Math.max(-posBound, Math.min(posBound, snake.position.y)) : 0;

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

            // ── snake-vs-snake collision ──────────────────────────────────────
            const secondPoint     = snake.points[0];
            const capturedTurnGen = snake.turnGeneration;

            // Reconstruct the head position one tick ago so the initial check
            // is limited to the movement that actually happened this tick.
            // This prevents false positives from stale head-segment history.
            let prevHeadX = snake.position.x;
            let prevHeadY = snake.position.y;
            switch (snake.direction) {
                case Enums.Directions.UP:    prevHeadY -= dist; break;
                case Enums.Directions.DOWN:  prevHeadY += dist; break;
                case Enums.Directions.LEFT:  prevHeadX += dist; break;
                case Enums.Directions.RIGHT: prevHeadX -= dist; break;
            }
            const prevHead = { x: prevHeadX, y: prevHeadY };
            const snapPos  = { x: snake.position.x, y: snake.position.y };

            // Query the segment index for the one-tick movement.
            // O(1) average — checks 1-2 perpendicular buckets + 1 collinear
            // bucket regardless of arena size or segment length.
            const collisionHits = this.segmentIndex.queryMove(
                snake.direction, prevHead, snapPos, Enums.Directions
            );

            for (const hit of collisionHits) {
                const other = hit.snake;

                // Skip own head segment and own first body segment (T-touch guard).
                if (other === snake) {
                    if (hit.id === snake._headSegHandle?.id)     continue;
                    if (hit.id === snake._bodySegHandles[0]?.id) continue;
                }

                // Snapshot hit segment endpoints at detection time.
                const snapPt  = hit.isH ? { x: hit.xMin, y: hit.y    } : { x: hit.x, y: hit.yMin };
                const snapPtN = hit.isH ? { x: hit.xMax, y: hit.y    } : { x: hit.x, y: hit.yMax };

                const delay = (snake.client.ping || 0) + 30;
                setTimeout(() => {
                    if (!snake.spawned || !other.spawned) return;
                    // Walk every segment travelled since detection.
                    // points[extraTurns] = secondPoint (turn point at detection time).
                    const extraTurns = snake.turnGeneration - capturedTurnGen;
                    for (let j = 0; j <= extraTurns; j++) {
                        const segStart = j === 0 ? snake.position : snake.points[j - 1];
                        const segEnd   = snake.points[j] ?? (j === extraTurns ? secondPoint : null);
                        if (!segEnd) break;
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

            // ── rubbing detection ─────────────────────────────────────────────
            // Use the same index with a radius query so we don't need the old
            // O(N × L) GetPointsNearSnake loop.
            let closestRub = null;
            const rubbingHits = this.segmentIndex.queryRadius(snake.position, 4);
            for (const hit of rubbingHits) {
                if (hit.snake === snake) continue; // no self-rubbing
                const p1 = hit.isH ? { x: hit.xMin, y: hit.y    } : { x: hit.x, y: hit.yMin };
                const p2 = hit.isH ? { x: hit.xMax, y: hit.y    } : { x: hit.x, y: hit.yMax };
                const nearest = MapFunctions.NearestPointOnLine(snake.position, p1, p2);
                if (nearest.distance < 4 && (!closestRub || nearest.distance < closestRub.distance)) {
                    closestRub = { point: nearest.point, distance: nearest.distance, other: hit.snake };
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

            // ── update head segment in index ──────────────────────────────────
            // Done after collision/rubbing so this tick's queries see the
            // previous-tick extent; subsequent snakes see the updated extent.
            snake._refreshHeadSeg();

            // ── eat combo decay ───────────────────────────────────────────────
            if (Date.now() - snake.lastAte > 500) snake.eatCombo = 0;

            // ── speed from eat combo ──────────────────────────────────────────
            // Ramp toward MaxBoostSpeed while eating, but CLAMP at the cap and
            // hold there. The old code tested `extraSpeed + 1 <= MaxBoostSpeed`
            // then added 2, overshooting to 256 at the 255 cap; extraSpeed then
            // oscillated 254↔256 and — since it's sent as a uint8 — 256 wrapped
            // to 0, making the snake flash and the boost sound cut in and out.
            if (snake.eatCombo >= 5) {
                const cap = this.config.MaxBoostSpeed;
                if (snake.speedBypass) {
                    snake.extraSpeed += 2;
                } else if (snake.extraSpeed < cap) {
                    snake.extraSpeed = Math.min(snake.extraSpeed + 2, cap);
                }
                snake.speed    = 0.25 + snake.extraSpeed / 1000;
                snake.speeding = true; // hold at the cap rather than decaying back down
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

        // RefreshLeaderboard does a full AVL tree traversal every call.
        // Refreshing every 3 ticks (≈ 300 ms) is imperceptible to players
        // and saves ~67 % of the traversal cost at 200+ players.
        this._ticksSinceLeaderboard++;
        if (this._ticksSinceLeaderboard >= 3) {
            this.RefreshLeaderboard();
            this._ticksSinceLeaderboard = 0;
        }

        // Natural food spawning
        if (this.entityCount < this.maxNaturalFood) {
            if (Math.random() * 100 < this.foodSpawnPercent) new Food(this);
        }

        // Compute once and reuse — avoids repeated Object.values() allocation
        // in the per-client loop below.
        const clientList = Object.values(this.clients);

        for (const client of clientList) {
            const snake     = client.snake;
            const isSpawned = !client.dead;

            if (!isSpawned && client.spectating) continue;

            const { entitiesToAdd, entitiesToRemove, entitiesInRadius } =
                SnakeFunctions.GetEntitiesNearClient(client);

            // Food proximity eat — query only the small area around the snake
            // head via the quadtree (≈ the few food touching the head) instead of
            // scanning every loaded food each tick. The old per-loaded-food scan
            // was O(food in view) per client and pegged tick time to ~1s when
            // thousands of food were spawned; this is O(food near the head).
            if (isSpawned && snake) {
                const R = 3; // eat radius in world units (3² = 9 below)
                const nearFood = this.entityQuadtree.query({
                    x: snake.position.x - R, y: snake.position.y - R,
                    width: R * 2, height: R * 2,
                });
                for (const item of nearFood) {
                    if (item.subtype !== Enums.EntitySubtypes.SUB_ENTITY_ITEM_FOOD) continue;
                    const dx = snake.position.x - item.position.x;
                    const dy = snake.position.y - item.position.y;
                    if (dx * dx + dy * dy < 9) item.eat(snake);
                }
            }

            // Build partial-update list from currently loaded entities. Players
            // move every tick; items only need a partial when they actually moved
            // (e.g. death-drop food easing into place), flagged via lastUpdate.
            const partialEntities = [];
            for (const entity of Object.values(client.loadedEntities)) {
                if (entity.type === Enums.EntityTypes.ENTITY_PLAYER) {
                    partialEntities.push(entity);
                } else if (entity.type === Enums.EntityTypes.ENTITY_ITEM) {
                    if (entity.lastUpdate > this.lastUpdate) partialEntities.push(entity);
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
                const tailIdx    = snake._bodySegHandles.length - 1;

                if (lastLen > over) {
                    // Mutate the tail point in-place (preserves object identity
                    // so deferred-kill closures that captured secondPoint still
                    // reference the correct object).
                    last.x = last.x - dir.x * over;
                    last.y = last.y - dir.y * over;
                    totalLen = snake.visualLength;
                    // Update the tail segment in the index with its new extent.
                    if (tailIdx >= 0) {
                        this.segmentIndex.remove(snake._bodySegHandles[tailIdx]);
                        snake._bodySegHandles[tailIdx] = this.segmentIndex.insert(
                            snake, secondLast.x, secondLast.y, last.x, last.y
                        );
                    }
                } else {
                    totalLen -= lastLen;
                    snake.points.pop();
                    // Remove the consumed tail segment from the index.
                    if (tailIdx >= 0) {
                        this.segmentIndex.remove(snake._bodySegHandles[tailIdx]);
                        snake._bodySegHandles.pop();
                    }
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

        // Reject IP-banned connections outright (userid bans are also checked
        // after the session resolves, in finalize()).
        if (this.isBanned(ws._clientIP, null)) {
            ws.close(1008, 'You are banned from this server');
            return;
        }

        this.lastConnectionTime = Date.now();

        // Queue messages received before session lookup completes
        const queue = [];
        const enqueue = msg => queue.push(msg);
        ws.on('message', enqueue);

        const finalize = (user) => {
            // Userid bans are enforced here, once the session has resolved.
            if (user && this.isBanned(null, user.userid)) {
                try { ws.close(1008, 'You are banned from this server'); } catch {}
                return;
            }
            const client = new Client(this, ws, user || null);

            // Safely turn one raw frame into a dispatch. The opcode read
            // (getUint8(0)) and the DataView construction are done INSIDE a
            // try/catch here because they run synchronously, BEFORE the async
            // RecieveMessage promise exists — so a zero-length or malformed frame
            // would otherwise throw straight out of this 'message' listener with
            // no .catch() to absorb it, crashing the whole (multi-room) process.
            const dispatch = (msg) => {
                let view;
                try {
                    const bytes = new Uint8Array(msg);
                    if (bytes.byteLength < 1) return;   // ignore empty frames
                    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
                } catch (err) {
                    console.error(`[WS] Malformed frame from client ${client.id}:`, err && err.message);
                    return;
                }
                // RecieveMessage is async — without .catch() any thrown exception
                // becomes an unhandled promise rejection. A bad packet should only
                // be dropped, never disconnect or crash anything.
                client.RecieveMessage(view.getUint8(0), view).catch(err => {
                    console.error(`[WS] Unhandled error from client ${client.id}:`, err && err.message);
                });
            };

            // Replay queued messages, then switch to live dispatch.
            for (const msg of queue) dispatch(msg);
            ws.off('message', enqueue);
            ws.on('message', dispatch);

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

    // ── ban helpers ─────────────────────────────────────────────────────────

    isBanned(ip, userid) {
        if (ip && this.bannedIPs.has(ip)) return true;
        if (userid != null && this.bannedUsers.has(parseInt(userid))) return true;
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
                if (client.socket && client.socket.readyState === 1 && typeof client.socket.close === 'function') {
                    client.socket.close(1008, 'Server closed');
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
