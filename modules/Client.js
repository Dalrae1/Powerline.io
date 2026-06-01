const Enums           = require('./Enums.js');
const Snake           = require('./Snake.js');
const Food            = require('./Food.js');
const { SnakeFunctions } = require('./EntityFunctions.js');
const BinaryWriter    = require('./BinaryWriter.js');
const EventEmitter    = require('events');
const AntiBotTracker  = require('./AntiBotTracker.js');

// ─────────────────────────────────────────────────────────────────────────────

class Client extends EventEmitter {
    constructor(server, websocket, user) {
        super();
        this.server  = server;
        this.socket  = websocket;
        this.id      = server.clientIDs.allocateID();

        this.loadedEntities    = {};
        this.pointsNearby      = {};
        this.windowSizeX       = 128;
        this.windowSizeY       = 64;
        // Reusable writer — reset at the start of each update() call so we
        // don't allocate a new BinaryWriter (+ backing Uint8Array) every tick.
        this._writer           = new BinaryWriter(4096);
        this.dead              = true;
        this.spectating        = false;
        this.ping              = server.artificialPing;
        this.user              = user || null;
        this.messagesPerSecond = [];
        this.lastSecondCheck   = 0;

        // Anti-bot state
        this._clientIP             = websocket._clientIP || null;
        this._lastEnterTime        = 0;
        this._fastDeathStreak      = 0;
        this._reEntryCooldownUntil = 0;

        server.clients[this.id] = this;

        this.sendConfig();
        this.sendMapBarriers();
        this.sendChatHistory();

        console.log(user
            ? `Client connected to ${server.name} as user ${user.userid} (${user.username})`
            : `Client connected to ${server.name} (unauthenticated)`);
    }

    // ── ping / pong ───────────────────────────────────────────────────────────

    pingLoop() {
        this._doPing();
        setTimeout(() => this.pingLoop(), 500 + this.ping);
    }

    _doPing() {
        this.pingStart = Date.now();
        this._send(w => {
            w.writeUint8(Enums.ServerToClient.OPCODE_SC_PING);
            w.writeUint16(this.ping || 0);
        }, 3);
    }

    _pong() {
        this._send(w => w.writeUint8(Enums.ServerToClient.OPCODE_SC_PONG), 1);
    }

    // ── incoming messages ─────────────────────────────────────────────────────

    async RecieveMessage(messageType, view) {
        // Simulate artificial latency if configured
        if (this.server.artificialPing > 0) {
            await new Promise(r => setTimeout(r, this.server.artificialPing / 2));
        }

        // Require a snake for most messages
        const needsSnake =
            messageType !== Enums.ClientToServer.OPCODE_ENTER_GAME    &&
            messageType !== Enums.ClientToServer.OPCODE_HELLO_V4      &&
            messageType !== Enums.ClientToServer.OPCODE_HELLO_DEBUG   &&
            messageType !== Enums.ClientToServer.OPCODE_CS_PING       &&
            messageType !== Enums.ClientToServer.OPCODE_CS_PONG;

        if (needsSnake && (!this.snake || !this.snake.id)) return;

        // Rate-limit per message type
        const now = Date.now();
        if (now - this.lastSecondCheck > 1000) {
            this.lastSecondCheck   = now;
            this.messagesPerSecond = [];
        }
        this.messagesPerSecond[messageType] = (this.messagesPerSecond[messageType] || 0) + 1;
        if (this.messagesPerSecond[messageType] > this.server.config.MaxMessagesPerSecond) return;

        switch (messageType) {
            case Enums.ClientToServer.OPCODE_CS_PING:
                this._pong();
                break;

            case Enums.ClientToServer.OPCODE_CS_PONG:
                this.ping = Date.now() - this.pingStart;
                break;

            case Enums.ClientToServer.OPCODE_HELLO_V4:
            case Enums.ClientToServer.OPCODE_HELLO_DEBUG:
                this.pingLoop();
                break;

            case Enums.ClientToServer.OPCODE_ENTER_GAME: {
                const nick = global.getString(view, 1);
                if (nick.string.length > 25) return;
                if (!this.snake || !this.snake.spawned) {
                    // Anti-bot: enforce per-connection re-entry cooldown
                    const enterNow = Date.now();
                    if (enterNow < this._reEntryCooldownUntil) return;
                    // Anti-bot: enforce per-IP enter-rate limit
                    if (!AntiBotTracker.tryRecordEnter(this._clientIP)) return;

                    this._lastEnterTime = enterNow;
                    this.snake = new Snake(this, nick.string || '');
                }
                break;
            }

            case Enums.ClientToServer.OPCODE_INPUT_POINT: {
                const direction = view.getUint8(1);
                const vector    = view.getFloat32(2, true);
                this.snake.turn(direction, vector);
                break;
            }

            case Enums.ClientToServer.OPCODE_TALK:
                if (this.snake.talkStamina >= 255) {
                    this.snake.Talk(view.getUint8(1));
                    this.snake.talkStamina = 0;
                }
                break;

            case Enums.ClientToServer.OPCODE_AREA_UPDATE:
                // this.windowSizeX = view.getUint16(1, true);
                // this.windowSizeY = view.getUint16(3, true);
                break;

            case Enums.ClientToServer.OPCODE_BOOST:
                if (this._isPrivileged()) {
                    const boosting = view.getUint8(1) === 1;
                    if (boosting) {
                        this.snake.extraSpeed += 2;
                        if (this.snake.extraSpeed > this.server.config.MaxBoostSpeed)
                            this.snake.speedBypass = true;
                        this.snake.speed = 0.25 + this.snake.extraSpeed / (255 * UPDATE_EVERY_N_TICKS);
                    } else {
                        this.snake.speedBypass = false;
                        if (this.snake.extraSpeed > this.server.config.MaxBoostSpeed)
                            this.snake.extraSpeed = this.server.config.MaxBoostSpeed;
                    }
                }
                break;

            case Enums.ClientToServer.OPCODE_DEBUG_GRAB:
                if (this._isPrivileged())
                    this.snake.length += SnakeFunctions.ScoreToLength(this.server.debugGrabAmount);
                break;

            case 0x0d: // Invincible
                if (this._isPrivileged())
                    this.snake.invincible = view.getUint8(1) === 1;
                break;

            case 0x0e: // Commands
                this._handleCommand(view);
                break;
        }
    }

    // ── privilege check ───────────────────────────────────────────────────────

    _isPrivileged() {
        return this.user && (this.server.admins.includes(this.user.userid) || this.user.rank > 2);
    }

    // ── command handler ───────────────────────────────────────────────────────

    _handleCommand(view) {
        const command = global.getString(view, 1).string;
        if (!command) return;

        const args = command.split(' ');
        const cmd  = args[0].toLowerCase();

        const isPrivileged = this._isPrivileged();
        if (!isPrivileged && cmd !== 'say') return;

        console.log(`Command "${command}" from ${this.snake.nick}`);

        const intArg   = n => { const v = parseInt(args[n]);    return isNaN(v) ? null : v; };
        const floatArg = n => { const v = parseFloat(args[n]);  return isNaN(v) ? null : v; };

        const clampedInt = (idx, lo, hi) => {
            const v = intArg(idx);
            return v !== null && v >= lo && v <= hi ? v : null;
        };

        switch (cmd) {
            case 'debuggrabammount': {
                const v = clampedInt(1, 0, 100000);
                if (v !== null) this.server.debugGrabAmount = v;
                break;
            }
            case 'arenasize': {
                const v = clampedInt(1, 0, 10000);
                if (v !== null) {
                    this.server.config.ArenaSize = v;
                    Object.values(this.server.clients).forEach(c => c.sendConfig());
                }
                break;
            }
            case 'maxboostspeed': {
                const v = clampedInt(1, 0, 1000);
                if (v !== null) this.server.config.MaxBoostSpeed = v;
                break;
            }
            case 'maxrubspeed': {
                const v = clampedInt(1, 0, 1000);
                if (v !== null) this.server.config.MaxRubSpeed = v;
                break;
            }
            case 'updateinterval': {
                const v = clampedInt(1, 20, 10000);
                if (v !== null) this.server.config.UpdateInterval = v;
                break;
            }
            case 'maxfood': {
                const v = clampedInt(1, 1, 60000);
                if (v !== null) this.server.maxFood = v;
                break;
            }
            case 'maxnaturalfood': {
                const v = clampedInt(1, 1, 10000);
                if (v !== null) this.server.maxNaturalFood = v;
                break;
            }
            case 'foodspawnpercent': {
                const v = clampedInt(1, 1, 100000);
                if (v !== null) this.server.foodSpawnPercent = v;
                break;
            }
            case 'defaultlength': {
                const v = clampedInt(1, 1, 100000);
                if (v !== null) this.server.config.DefaultLength = v;
                break;
            }
            case 'randomfood': {
                const v = clampedInt(1, 1, 1000);
                if (v !== null) for (let i = 0; i < v; i++) new Food(this.server);
                break;
            }
            case 'clearfood':
                Object.values(this.server.entities).forEach(e => {
                    if (e.type === Enums.EntityTypes.ENTITY_ITEM) e.eat();
                });
                break;
            case 'foodmultiplier': {
                const v = clampedInt(1, 1, 10);
                if (v !== null) this.server.foodMultiplier = v;
                break;
            }
            case 'foodvalue': {
                const v = clampedInt(1, 1, 10000);
                if (v !== null) {
                    this.server.config.FoodValue = SnakeFunctions.ScoreToLength(v);
                    Object.values(this.server.entities).forEach(e => {
                        if (e.type === Enums.EntityTypes.ENTITY_ITEM) e.value = this.server.config.FoodValue;
                    });
                }
                break;
            }
            case 'say': {
                if (this.dead || this.snake.talkStamina < 255) return;
                const msg = args.slice(1).join(' ').substring(0, 50);
                this.snake.flags    |= Enums.EntityFlags.SHOW_CUSTOM_TALKING;
                this.snake.flags    &= ~Enums.EntityFlags.SHOW_TALKING;
                this.snake.customTalk = msg;
                this.snake.talkStamina = 0;
                setTimeout(() => {
                    if (!this.dead) this.snake.flags &= ~Enums.EntityFlags.SHOW_CUSTOM_TALKING;
                }, 5000);
                this.server.chatHistory.push({ nick: this.snake.nick, message: msg });
                const buf = this._buildChatPacket(this.snake.nick, msg);
                this.server.clients.forEach(c => c.socket.send(buf));
                break;
            }
            case 'debug': {
                const target = (args[1] && this.server.entities[parseInt(args[1])]) || this.snake;
                target.flags ^= Enums.EntityFlags.DEBUG;
                break;
            }
            case 'debugall':
                Object.values(this.server.entities).forEach(e => {
                    if (e.type === Enums.EntityTypes.ENTITY_PLAYER) e.flags ^= Enums.EntityFlags.DEBUG;
                });
                break;
            case 'length': {
                const targetNick = args.slice(1).join(' ').toLowerCase();
                Object.values(this.server.clients).forEach(c => {
                    if (!c.dead && c.snake.nick.toLowerCase() === targetNick)
                        c.snake.length += SnakeFunctions.ScoreToLength(1000);
                });
                break;
            }
            case 'speedlock': {
                if (args[1]) {
                    const v = intArg(1);
                    if (v !== null && v >= 0) {
                        this.snake.extraSpeed = v;
                        this.snake.speed = 0.25 + v / (255 * UPDATE_EVERY_N_TICKS);
                        this.snake.lockspeed = true;
                    }
                } else {
                    this.snake.lockspeed = false;
                }
                break;
            }
            case 'teleport': {
                const x = floatArg(1), y = floatArg(2);
                if (x !== null && y !== null) {
                    this.snake.position.x = x;
                    this.snake.position.y = y;
                }
                break;
            }
            case 'createfood': {
                const v = clampedInt(1, 1, 1000);
                if (v !== null) {
                    for (let i = 0; i < v; i++) {
                        new Food(this.server,
                            this.snake.position.x + Math.random() * 10,
                            this.snake.position.y + Math.random() * 10 - 5);
                    }
                }
                break;
            }
            case 'timeleft':
                if (this.server.isEphemeral) {
                    const ms   = Math.max(0, 3600000 - (Date.now() - this.server.lastConnectionTime));
                    const mins = Math.floor(ms / 60000);
                    const secs = Math.floor((ms % 60000) / 1000);
                    this.sendAdminMessage(`Server auto-deletes in: ${mins}m ${secs}s`);
                } else {
                    this.sendAdminMessage('This is not an ephemeral server.');
                }
                break;
            case 'addadmin':
                if (this.server.isEphemeral && this._isOwner()) {
                    const id = intArg(1);
                    if (id !== null) {
                        this.sendAdminMessage(
                            this.server.addAdmin(id)
                                ? `Added user ${id} as admin.`
                                : `User ${id} is already an admin.`);
                    } else {
                        this.sendAdminMessage('Usage: addadmin <userid>');
                    }
                } else {
                    this.sendAdminMessage(this.server.isEphemeral
                        ? 'Only the server owner can add admins.'
                        : 'This command only works on custom servers.');
                }
                break;
            case 'removeadmin':
                if (this.server.isEphemeral && this._isOwner()) {
                    const id = intArg(1);
                    if (id !== null) {
                        this.sendAdminMessage(
                            this.server.removeAdmin(id)
                                ? `Removed user ${id} from admins.`
                                : `Cannot remove user ${id} (not an admin or is owner).`);
                    } else {
                        this.sendAdminMessage('Usage: removeadmin <userid>');
                    }
                } else {
                    this.sendAdminMessage(this.server.isEphemeral
                        ? 'Only the server owner can remove admins.'
                        : 'This command only works on custom servers.');
                }
                break;
            case 'deleteserver':
                if (this.server.isEphemeral && this._isOwner()) {
                    this.sendAdminMessage('Deleting server...');
                    setTimeout(() => this.server.destroy(), 500);
                } else {
                    this.sendAdminMessage(this.server.isEphemeral
                        ? 'Only the server owner can delete this server.'
                        : 'This command only works on custom servers.');
                }
                break;
        }
    }

    _isOwner() {
        return this.user && this.user.userid === parseInt(this.server.owner);
    }

    // ── anti-bot: progressive re-entry cooldown ───────────────────────────────

    /**
     * Called by Snake.kill() whenever this client's snake dies.
     *
     * Only deaths under 3 s count as "fast" — anything longer is normal
     * gameplay and never accumulates a streak.  The first two fast deaths in
     * a row are free (bots regularly die instantly due to lag or despawns, so
     * one or two quick deaths can happen legitimately).  Meaningful friction
     * only starts from the third consecutive < 3 s death onwards:
     *
     *   streak 0–1 →   0 s  (instant respawn)
     *   streak 2   →   0 s  (still instant)
     *   streak 3   → 1.5 s
     *   streak 4   →   8 s
     *   streak 5+  → 180 s  (3 min)
     *
     * A death where the snake survived ≥ 3 s decrements the streak by 1, so
     * a normal player who occasionally gets killed early is never penalised.
     */
    _onSnakeDied() {
        // ms alive is measured from when OPCODE_ENTER_GAME was accepted
        const aliveMs = Date.now() - this._lastEnterTime;
        const COOLDOWNS = [0, 0, 0, 1_500, 8_000, 180_000];

        if (aliveMs < 3_000) {
            // Fast death (< 3 s) — matches the food-reduction threshold;
            // ratchet the streak up toward meaningful cooldowns.
            this._fastDeathStreak = Math.min(this._fastDeathStreak + 1, COOLDOWNS.length - 1);
        } else {
            // Normal death — ease the streak back down so a legitimate player
            // who occasionally dies quickly won't accumulate a lasting penalty.
            this._fastDeathStreak = Math.max(0, this._fastDeathStreak - 1);
        }

        const cooldown = COOLDOWNS[this._fastDeathStreak];
        if (cooldown > 0) {
            this._reEntryCooldownUntil = Date.now() + cooldown;
        }
    }

    // ── outgoing packet helpers ───────────────────────────────────────────────

    /** Build a packet with a callback that writes into a BinaryWriter, then send it. */
    _send(writeFn, hintSize = 64) {
        const w = new BinaryWriter(hintSize);
        writeFn(w);
        this.socket.send(w.toBuffer());
    }

    sendAdminMessage(message) {
        this._send(w => {
            w.writeUint8(Enums.ServerToClient.OPCODE_SERVER_MESSAGE);
            w.writeString(message);
        }, 4 + message.length * 2);
    }

    sendConfig() {
        this._send(w => {
            w.writeUint8(this.server.config.ConfigType);
            w.writeFloat32(this.server.config.ArenaSize);
            w.writeFloat32(this.server.config.DefaultZoom);
            w.writeFloat32(this.server.config.MinimumZoom);
            w.writeFloat32(this.server.config.MinimumZoomScore);
            w.writeFloat32(this.server.config.ZoomLevel2);
            w.writeFloat32(0); // reserved
            w.writeFloat32(this.server.config.GlobalWebLag);
            w.writeFloat32(this.server.config.GlobalMobileLag);
            w.writeFloat32(this.server.config.OtherSnakeDelay);
            w.writeFloat32(this.server.config.IsTalkEnabled);
        }, 49);
    }

    sendMapBarriers() {
        this._send(w => {
            w.writeUint8(Enums.ServerToClient.OPCODE_MAP_BARRIERS);
            for (const b of this.server.barriers) {
                w.writeFloat32(b.x);
                w.writeFloat32(b.y);
                w.writeFloat32(b.width);
                w.writeFloat32(b.height);
            }
        }, 1 + this.server.barriers.length * 16);
    }

    sendChatHistory() {
        const last50 = this.server.chatHistory.slice(-50);
        for (const { nick, message } of last50) {
            this.socket.send(this._buildChatPacket(nick, message));
        }
    }

    _buildChatPacket(nick, message) {
        const w = new BinaryWriter(8 + (nick.length + message.length) * 2);
        w.writeUint8(Enums.ServerToClient.OPCODE_CUSTOM_TALK);
        w.writeString(nick);
        w.writeString(message);
        return w.toBuffer();
    }

    // ── entity update packet ──────────────────────────────────────────────────

    /**
     * Serialise an entity's flag-dependent payload into the writer.
     * Used for both FULL and PARTIAL player updates (they carry identical flag data).
     */
    _writePlayerFlags(w, entity) {
        // Always include extended (16-bit) flags
        const is16Bit = 0x80;
        w.writeUint8(is16Bit);

        const flags = entity.debugEnabled ? (entity.flags | Enums.EntityFlags.DEBUG) : entity.flags;
        w.writeUint16(flags);

        if (flags & Enums.EntityFlags.DEBUG || entity.debugEnabled) {
            // Bounding box (zeroed – placeholder)
            for (let i = 0; i < 8; i++) w.writeFloat32(0);
            // Nearby collision points
            const pts = (this.pointsNearby && this.pointsNearby[entity.id]) || [];
            w.writeUint16(pts.length);
            for (const p of pts) {
                w.writeFloat32(p.point ? p.point.x : p.x);
                w.writeFloat32(p.point ? p.point.y : p.y);
            }
            if (flags & Enums.EntityFlags.DEBUG) entity.debugEnabled = true;
            else entity.debugEnabled = false;
        }

        if (flags & Enums.EntityFlags.IS_RUBBING) {
            w.writeFloat32(entity.rubX);
            w.writeFloat32(entity.rubY);
            w.writeUint16(entity.RubSnake.id);
        }

        if (flags & Enums.EntityFlags.PING) {
            w.writeUint16(entity.ping || 0);
        }

        if (flags & Enums.EntityFlags.KILLSTREAK) {
            w.writeUint16(entity.killstreak);
        }

        if (flags & Enums.EntityFlags.SHOW_TALKING) {
            w.writeUint8(entity.talkId);
        }

        if (flags & Enums.EntityFlags.SHOW_CUSTOM_TALKING) {
            w.writeString(entity.customTalk);
        }

        if (flags & Enums.EntityFlags.CUSTOM_COLOR) {
            w.writeString(entity.customHead);
            w.writeString(entity.customBody);
            w.writeString(entity.customTail);
        }
    }

    /**
     * Main per-tick update method.
     *
     * @param {number}   updateType  - FULL | PARTIAL | DELETE
     * @param {object[]} entities    - list of entities to include
     */
    update(updateType, entities) {
        const entityList = Object.values(entities);

        // Reuse the per-client BinaryWriter instead of allocating a new one
        // (+ backing Uint8Array) every tick.  toBuffer() slices a copy so the
        // WebSocket send gets a stable buffer even though we reuse _writer.
        const w = this._writer;
        w.reset();
        w.writeUint8(Enums.ServerToClient.OPCODE_ENTITY_INFO);

        for (const entity of entityList) {
            if (!entity.position || !entity.spawned) continue;

            // PARTIAL/DELETE require entity to already be loaded on the client
            const isLoaded = !!this.loadedEntities[entity.id];
            if (updateType !== Enums.UpdateTypes.UPDATE_TYPE_FULL && !isLoaded) continue;

            w.writeUint16(entity.id);
            w.writeUint8(updateType);

            switch (updateType) {
                // ── full spawn ─────────────────────────────────────────────────
                case Enums.UpdateTypes.UPDATE_TYPE_FULL: {
                    w.writeUint8(entity.type);
                    w.writeUint8(entity.subtype || 0);

                    if (entity.type === Enums.EntityTypes.ENTITY_PLAYER) {
                        w.writeString(entity.nick);
                    } else {
                        w.writeUint16(0); // null name for non-player
                    }

                    if (entity.type === Enums.EntityTypes.ENTITY_PLAYER) {
                        w.writeFloat32(entity.position.x);
                        w.writeFloat32(entity.position.y);
                        w.writeFloat32(entity.speed);
                        w.writeFloat32(entity.visualLength);
                        w.writeUint8(0);                      // direction placeholder
                        w.writeUint16(entity.points.length);
                        this._writePlayerFlags(w, entity);
                        w.writeUint8(entity.talkStamina);
                        w.writeUint8(entity.extraSpeed);
                        for (const pt of entity.points) {
                            w.writeFloat32(pt.x);
                            w.writeFloat32(pt.y);
                        }
                        w.writeUint16(entity.color);
                        w.writeUint8(0); // mobile flag
                    } else if (entity.type === Enums.EntityTypes.ENTITY_ITEM) {
                        w.writeFloat32(entity.position.x);
                        w.writeFloat32(entity.position.y);
                        w.writeUint16(entity.color);
                    }

                    this.loadedEntities[entity.id] = entity;
                    break;
                }

                // ── incremental update ─────────────────────────────────────────
                case Enums.UpdateTypes.UPDATE_TYPE_PARTIAL: {
                    if (entity.type === Enums.EntityTypes.ENTITY_PLAYER) {
                        w.writeFloat32(entity.position.x);
                        w.writeFloat32(entity.position.y);
                        w.writeFloat32(entity.speed);
                        w.writeFloat32(entity.visualLength);
                        w.writeUint8(entity.direction);
                        w.writeUint16(entity.points.length);
                        this._writePlayerFlags(w, entity);
                        w.writeUint8(entity.talkStamina);
                        w.writeUint8(entity.extraSpeed);
                        // New turn points (sent in reverse: newest → oldest)
                        const np = entity.newPoints;
                        w.writeUint8(np.length);
                        for (let i = np.length - 1; i >= 0; i--) {
                            w.writeFloat32(np[i].x);
                            w.writeFloat32(np[i].y);
                        }
                    } else if (entity.type === Enums.EntityTypes.ENTITY_ITEM) {
                        w.writeFloat32(entity.position.x);
                        w.writeFloat32(entity.position.y);
                    }
                    break;
                }

                // ── removal ────────────────────────────────────────────────────
                case Enums.UpdateTypes.UPDATE_TYPE_DELETE: {
                    w.writeUint16(0);                           // kill sound (0 = silent)
                    w.writeUint8(Enums.KillReasons.LEFT_SCREEN);
                    if (entity.type === Enums.EntityTypes.ENTITY_PLAYER) {
                        w.writeFloat32(entity.position.x);
                        w.writeFloat32(entity.position.y);
                    }
                    delete this.loadedEntities[entity.id];
                    break;
                }
            }
        }

        // King info (always appended)
        const king = this.server.king;
        w.writeUint16(0);                               // entity list terminator
        w.writeUint16(king ? king.id : 0);
        w.writeFloat32(king ? king.position.x : 0);
        w.writeFloat32(king ? king.position.y : 0);

        this.socket.send(w.toBuffer());
    }
}

module.exports = Client;
