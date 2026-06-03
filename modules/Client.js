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

        // Moderation: set by the `mute` admin command, gates say / talk.
        this.muted = false;

        server.clients[this.id] = this;

        this.sendConfig();
        this.sendMapBarriers();
        this.sendChatHistory();
        this.sendPermissions();

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
            messageType !== Enums.ClientToServer.OPCODE_CS_PONG       &&
            // Admin panel may request the full player list while dead or before
            // spawning, so this read-only request doesn't require a live snake.
            messageType !== Enums.ClientToServer.OPCODE_ADMIN_LIST_REQUEST;

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
                if (this.muted) break;
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

            case Enums.ClientToServer.OPCODE_ADMIN_LIST_REQUEST:
                this._sendAdminPlayers();
                break;
        }
    }

    // ── admin panel: full player list ────────────────────────────────────────
    // Sends EVERY player currently on the server (not just the ones streamed to
    // this client). Only privileged clients (Moderator+) receive it.
    _sendAdminPlayers() {
        if (this.permissionLevel() < 1) return;
        const players = [];
        for (const c of Object.values(this.server.clients)) {
            if (!c.snake || !c.snake.spawned) continue;
            players.push(c);
        }
        this._send(w => {
            w.writeUint8(Enums.ServerToClient.OPCODE_ADMIN_PLAYERS);
            w.writeUint16(players.length);
            for (const c of players) {
                w.writeUint16(c.snake.id);
                w.writeUint8(typeof c.permissionLevel === 'function' ? c.permissionLevel() : 0);
                w.writeUint8(c.muted ? 1 : 0);
                w.writeUint8(c.snake.frozen ? 1 : 0);
                w.writeUint8(c.isBot ? 1 : 0);
                w.writeUint32(Math.max(0, Math.round(c.snake.visualLength || 0)));
                w.writeUint16(Math.round(c.snake.color || 0) & 0xFFFF);
                w.writeString((c.snake.nick || '').slice(0, 25));
            }
        }, 64 + players.length * 48);
    }

    // Push a cosmetic (nick + hue) update for a snake to every client that has it
    // loaded (plus its own client). nick and hue only ride along in FULL entity
    // updates, so this is how an admin's rename/recolour replicates live without
    // re-streaming the whole entity.
    _broadcastCosmetic(snake) {
        if (!snake) return;
        const nick = (snake.nick || '').slice(0, 25);
        const hue  = Math.round(snake.color || 0) & 0xFFFF;
        const build = w => {
            w.writeUint8(Enums.ServerToClient.OPCODE_ENTITY_COSMETIC);
            w.writeUint16(snake.id);
            w.writeUint16(hue);
            w.writeString(nick);
        };
        const size = 8 + nick.length * 2;
        for (const c of Object.values(this.server.clients)) {
            if (c.loadedEntities[snake.id] || c.snake === snake) {
                try { c._send(build, size); } catch (_) {}
            }
        }
    }

    // ── permission tiers ───────────────────────────────────────────────────────
    //
    //   0 PLAYER     — no privileges
    //   1 MODERATOR  — moderation: mute / kick / ban / kill
    //   2 ADMIN      — full control of this arena and any snake in it
    //   3 DEVELOPER  — global: admin in EVERY server + delete / edit servers
    //
    //  The DB `rank` column is the global rank (0..3+).  On top of that, the
    //  OWNER of a server and anyone in server.admins[] get ADMIN (2) in THAT
    //  server regardless of their global rank.  Developers (rank ≥ 3) are admin
    //  everywhere and outrank even the owner.

    permissionLevel() {
        // Dev mode (DEV_SKIP_AUTH): auth is skipped and everyone — even
        // unauthenticated clients — is treated as a full Developer.
        if (this.server.isDevServer) return 3;
        if (!this.user) return 0;
        const rank = this.user.rank || 0;
        if (rank >= 3) return 3;                       // developer — global
        let level = Math.max(0, Math.min(2, rank));    // global rank 0..2
        if (this._isOwner() || this.server.admins.includes(this.user.userid))
            level = Math.max(level, 2);                // owner / server-admin → admin here
        return level;
    }

    // True if this client outranks another (used so a moderator can't act on an
    // equal-or-higher-ranked player). In dev mode everyone is level 3, so we
    // treat it as a free-for-all sandbox where anyone may act on anyone.
    _outranks(other) {
        if (this.server.isDevServer) return true;
        const theirs = (other && typeof other.permissionLevel === 'function') ? other.permissionLevel() : 0;
        return this.permissionLevel() > theirs;
    }

    // Backwards-compatible privileged check used by self-affecting opcodes
    // (boost / invincible / debug-grab) — these require ADMIN (2).
    _isPrivileged() {
        return this.permissionLevel() >= 2;
    }

    // Resolve a live client by the entity id of its snake (admin panel targets
    // players by id, which the client already knows from streamed entities).
    _clientByEntityId(id) {
        if (id == null || isNaN(id)) return null;
        return Object.values(this.server.clients)
            .find(c => c.snake && c.snake.id === id) || null;
    }

    // Resolve a target client for a player-directed command, with the usual
    // checks + admin messaging. Returns the client, or null (after messaging).
    //   label   — command name for error messages
    //   outrank — require this client to outrank the target (default true)
    //   allowSelf — allow targeting yourself even without outranking (default true)
    _targetClient(id, label, { outrank = true, allowSelf = true } = {}) {
        const t = this._clientByEntityId(id);
        if (!t || !t.snake || t.dead) { this.sendAdminMessage(`${label}: player not found.`); return null; }
        if (outrank && !(allowSelf && t === this) && !this._outranks(t)) {
            this.sendAdminMessage(`${label}: target is equal or higher rank.`); return null;
        }
        return t;
    }

    // ── command handler ───────────────────────────────────────────────────────

    _handleCommand(view) {
        const command = global.getString(view, 1).string;
        if (!command) return;

        const args = command.split(' ');
        const cmd  = args[0].toLowerCase();

        const level = this.permissionLevel();

        // Minimum permission level required for each command. 'say' is open to
        // everyone (still subject to mute). Anything not listed defaults to ADMIN.
        const REQUIRED = {
            say: 0,
            // ── Moderator (1): player moderation + light global actions ────────
            kick: 1, ban: 1, unban: 1, mute: 1, unmute: 1, kill: 1, timeleft: 1,
            freeze: 1, unfreeze: 1, warn: 1, announce: 1, muteall: 1, unmuteall: 1,
            stripspeed: 1, clearstreak: 1, clearchat: 1,
            // ── Admin (2): full arena + any-snake control ──────────────────────
            length: 2, setlength: 2, setspeed: 2, speedlock: 2, teleport: 2,
            debug: 2, debugall: 2, createfood: 2, clearfood: 2, randomfood: 2,
            debuggrabammount: 2, arenasize: 2, maxboostspeed: 2, maxrubspeed: 2,
            updateinterval: 2, maxfood: 2, maxnaturalfood: 2, foodspawnpercent: 2,
            defaultlength: 2, foodmultiplier: 2, foodvalue: 2,
            grow: 2, shrink: 2, boost: 2, sethue: 2, rename: 2, invincible: 2,
            tpto: 2, bring: 2, createfoodat: 2, killall: 2, freezeall: 2,
            unfreezeall: 2, setspeedall: 2, extendserver: 2,
            // Owner / Developer (case body does the finer owner-vs-dev check)
            addadmin: 2, removeadmin: 2, deleteserver: 2,
            // ── Developer (3): server lifecycle + structural ───────────────────
            setservertime: 3, setmaxplayers: 3, setservername: 3, setowner: 3,
            resetbans: 3, setping: 3, spawnbarrier: 3, clearbarriers: 3,
        };
        const need = REQUIRED[cmd] ?? 2;
        if (level < need) {
            if (cmd !== 'say') this.sendAdminMessage('You do not have permission for that.');
            return;
        }

        console.log(`Command "${command}" from ${this.snake?.nick ?? `client ${this.id}`} (level ${level})`);

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
                // Admins bypass the soft food caps, but the count is clamped to
                // the remaining capacity under the hard uint16 entity-id limit,
                // so a huge number (e.g. 8e9) can neither overflow IDs nor spin
                // the server in an enormous loop.
                const requested = intArg(1);
                if (requested === null || requested < 1) break;
                const remaining = Math.max(0, Food.HARD_ENTITY_LIMIT - Object.keys(this.server.entities).length);
                const v = Math.min(requested, remaining);
                if (v <= 0) { this.sendAdminMessage('Server is at the entity limit — cannot spawn more food.'); break; }
                for (let i = 0; i < v; i++) new Food(this.server, undefined, undefined, undefined, null, undefined, true);
                this.sendAdminMessage(v < requested
                    ? `Spawned ${v} food (capped at the ${Food.HARD_ENTITY_LIMIT}-entity server limit).`
                    : `Spawned ${v} food.`);
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
                if (this.muted) { this.sendAdminMessage('You are muted.'); return; }
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
                const requested = intArg(1);
                if (requested === null || requested < 1) break;
                const remaining = Math.max(0, Food.HARD_ENTITY_LIMIT - Object.keys(this.server.entities).length);
                const v = Math.min(requested, remaining);
                if (v <= 0) { this.sendAdminMessage('Server is at the entity limit — cannot spawn more food.'); break; }
                for (let i = 0; i < v; i++) {
                    new Food(this.server,
                        this.snake.position.x + Math.random() * 10,
                        this.snake.position.y + Math.random() * 10 - 5,
                        undefined, null, undefined, true);
                }
                this.sendAdminMessage(v < requested
                    ? `Spawned ${v} food (capped at the ${Food.HARD_ENTITY_LIMIT}-entity server limit).`
                    : `Spawned ${v} food.`);
                break;
            }
            // ── Moderation: target another player by entity id ────────────────
            case 'kick': {
                const t = this._clientByEntityId(intArg(1));
                if (!t)               { this.sendAdminMessage('kick: player not found.'); break; }
                if (!this._outranks(t)) { this.sendAdminMessage('You cannot kick an equal or higher rank.'); break; }
                const who = t.snake?.nick ?? `id ${args[1]}`;
                try { t.socket.close(1008, 'Kicked by an admin'); } catch {}
                this.sendAdminMessage(`Kicked ${who}.`);
                break;
            }
            case 'ban': {
                const t = this._clientByEntityId(intArg(1));
                if (!t)               { this.sendAdminMessage('ban: player not found.'); break; }
                if (!this._outranks(t)) { this.sendAdminMessage('You cannot ban an equal or higher rank.'); break; }
                const who = t.snake?.nick ?? `id ${args[1]}`;
                if (t._clientIP) this.server.bannedIPs.add(t._clientIP);
                if (t.user)      this.server.bannedUsers.add(parseInt(t.user.userid));
                try { t.socket.close(1008, 'Banned by an admin'); } catch {}
                this.sendAdminMessage(`Banned ${who}.`);
                break;
            }
            case 'unban': {
                const a = args[1];
                if (!a) { this.sendAdminMessage('Usage: unban <ip|userid>'); break; }
                let removed = this.server.bannedIPs.delete(a);
                const uid = parseInt(a);
                if (!isNaN(uid) && this.server.bannedUsers.delete(uid)) removed = true;
                this.sendAdminMessage(removed ? `Unbanned ${a}.` : `No active ban for ${a}.`);
                break;
            }
            case 'mute': {
                const t = this._clientByEntityId(intArg(1));
                if (!t)               { this.sendAdminMessage('mute: player not found.'); break; }
                if (!this._outranks(t)) { this.sendAdminMessage('You cannot mute an equal or higher rank.'); break; }
                t.muted = true;
                this.sendAdminMessage(`Muted ${t.snake?.nick ?? `id ${args[1]}`}.`);
                break;
            }
            case 'unmute': {
                const t = this._clientByEntityId(intArg(1));
                if (!t) { this.sendAdminMessage('unmute: player not found.'); break; }
                t.muted = false;
                this.sendAdminMessage(`Unmuted ${t.snake?.nick ?? `id ${args[1]}`}.`);
                break;
            }
            case 'kill': {
                const t = this._clientByEntityId(intArg(1));
                if (!t || !t.snake || t.dead) { this.sendAdminMessage('kill: player not found.'); break; }
                if (t !== this && !this._outranks(t)) { this.sendAdminMessage('You cannot kill an equal or higher rank.'); break; }
                const who = t.snake.nick;
                t.snake.kill(Enums.KillReasons.BOUNDARY, t.snake);
                this.sendAdminMessage(`Killed ${who}.`);
                break;
            }
            case 'setlength': {
                const t   = this._targetClient(intArg(1), 'setlength');  // enforces rank guard
                const len = intArg(2);
                if (!t) break;
                if (len === null || len < 1 || len > 1000000) { this.sendAdminMessage('Usage: setlength <id> <length 1-1000000>'); break; }
                t.snake.length       = len;   // setter keeps the leaderboard in sync
                t.snake.visualLength = len;   // snap visual length so the change is immediate
                this.sendAdminMessage(`Set ${t.snake.nick}'s length to ${len}.`);
                break;
            }
            case 'setspeed': {
                const t = this._targetClient(intArg(1), 'setspeed');     // enforces rank guard
                const v = intArg(2);
                if (!t) break;
                if (v === null || v < 0 || v > 100000) { this.sendAdminMessage('Usage: setspeed <id> <extraSpeed 0-100000>'); break; }
                t.snake.extraSpeed = v;
                t.snake.speed      = 0.25 + v / (255 * UPDATE_EVERY_N_TICKS);
                t.snake.lockspeed  = v > 0;
                this.sendAdminMessage(`Set ${t.snake.nick}'s extra speed to ${v}.`);
                break;
            }
            // ── Level 1: additional moderation ────────────────────────────────
            case 'freeze': {
                const t = this._targetClient(intArg(1), 'freeze');
                if (!t) break;
                t.snake.frozen = true;
                this.sendAdminMessage(`Froze ${t.snake.nick}.`);
                break;
            }
            case 'unfreeze': {
                const t = this._targetClient(intArg(1), 'unfreeze', { outrank: false });
                if (!t) break;
                t.snake.frozen = false;
                this.sendAdminMessage(`Unfroze ${t.snake.nick}.`);
                break;
            }
            case 'warn': {
                const t = this._targetClient(intArg(1), 'warn', { outrank: false });
                if (!t) break;
                const msg = args.slice(2).join(' ').substring(0, 120);
                if (!msg) { this.sendAdminMessage('Usage: warn <id> <message>'); break; }
                t.sendAdminMessage(`⚠ Warning: ${msg}`);
                this.sendAdminMessage(`Warned ${t.snake.nick}.`);
                break;
            }
            case 'announce': {
                const msg = args.slice(1).join(' ').substring(0, 160);
                if (!msg) { this.sendAdminMessage('Usage: announce <message>'); break; }
                for (const c of Object.values(this.server.clients)) c.sendAdminMessage(`📢 ${msg}`);
                break;
            }
            case 'muteall': {
                let n = 0;
                for (const c of Object.values(this.server.clients))
                    if (c !== this && this._outranks(c)) { c.muted = true; n++; }
                this.sendAdminMessage(`Muted ${n} player(s).`);
                break;
            }
            case 'unmuteall': {
                let n = 0;
                for (const c of Object.values(this.server.clients)) if (c.muted) { c.muted = false; n++; }
                this.sendAdminMessage(`Unmuted ${n} player(s).`);
                break;
            }
            case 'stripspeed': {
                const t = this._targetClient(intArg(1), 'stripspeed');
                if (!t) break;
                t.snake.extraSpeed = 0; t.snake.speed = 0.25; t.snake.lockspeed = false;
                this.sendAdminMessage(`Stripped ${t.snake.nick}'s speed.`);
                break;
            }
            case 'clearstreak': {
                const t = this._targetClient(intArg(1), 'clearstreak');
                if (!t) break;
                t.snake.killstreak = 0;
                this.sendAdminMessage(`Cleared ${t.snake.nick}'s killstreak.`);
                break;
            }
            case 'clearchat': {
                // Wipe the server-side history AND tell every connected client to
                // clear its chat display, so it actually clears for everyone.
                this.server.chatHistory = [];
                const clearBuf = this._buildClearChatPacket();
                for (const c of Object.values(this.server.clients)) {
                    try { c.socket.send(clearBuf); } catch {}
                }
                this.sendAdminMessage('Chat cleared for all players.');
                break;
            }

            // ── Level 2: additional snake / arena control ─────────────────────
            case 'grow': {
                const t = this._targetClient(intArg(1), 'grow');
                const amt = intArg(2);
                if (!t) break;
                if (amt === null || amt <= 0) { this.sendAdminMessage('Usage: grow <id> <amount>'); break; }
                const nl = Math.min(1000000, (t.snake.length || 0) + amt);
                t.snake.length = nl; t.snake.visualLength = nl;
                this.sendAdminMessage(`Grew ${t.snake.nick} to ${Math.round(nl)}.`);
                break;
            }
            case 'shrink': {
                const t = this._targetClient(intArg(1), 'shrink');
                const amt = intArg(2);
                if (!t) break;
                if (amt === null || amt <= 0) { this.sendAdminMessage('Usage: shrink <id> <amount>'); break; }
                const nl = Math.max(1, (t.snake.length || 0) - amt);
                t.snake.length = nl; t.snake.visualLength = nl;
                this.sendAdminMessage(`Shrank ${t.snake.nick} to ${Math.round(nl)}.`);
                break;
            }
            case 'boost': {
                const t = this._targetClient(intArg(1), 'boost');
                const amt = intArg(2);
                if (!t) break;
                if (amt === null) { this.sendAdminMessage('Usage: boost <id> <amount>'); break; }
                t.snake.extraSpeed = Math.max(0, (t.snake.extraSpeed || 0) + amt);
                t.snake.speed = 0.25 + t.snake.extraSpeed / (255 * UPDATE_EVERY_N_TICKS);
                this.sendAdminMessage(`Boosted ${t.snake.nick} (+${amt}).`);
                break;
            }
            case 'sethue': {
                const t = this._targetClient(intArg(1), 'sethue');
                const hue = intArg(2);
                if (!t) break;
                if (hue === null || hue < 0 || hue > 360) { this.sendAdminMessage('Usage: sethue <id> <0-360>'); break; }
                t.snake.color = hue;
                this._broadcastCosmetic(t.snake);
                this.sendAdminMessage(`Set ${t.snake.nick}'s hue to ${hue}.`);
                break;
            }
            case 'rename': {
                const t = this._targetClient(intArg(1), 'rename');
                const name = args.slice(2).join(' ').substring(0, 25);
                if (!t) break;
                if (!name) { this.sendAdminMessage('Usage: rename <id> <name>'); break; }
                t.snake.nick = name;
                this._broadcastCosmetic(t.snake);
                this.sendAdminMessage(`Renamed #${args[1]} to ${name}.`);
                break;
            }
            case 'invincible': {
                const t = this._targetClient(intArg(1), 'invincible');
                const on = intArg(2);
                if (!t) break;
                t.snake.invincible = on === 1;
                this.sendAdminMessage(`${t.snake.nick} invincibility ${on === 1 ? 'ON' : 'OFF'}.`);
                break;
            }
            case 'tpto': {
                const t = this._targetClient(intArg(1), 'tpto', { outrank: false });
                if (!t) break;
                if (!this.snake || this.dead) { this.sendAdminMessage('tpto: you must be in-game.'); break; }
                this.snake.position.x = t.snake.position.x;
                this.snake.position.y = t.snake.position.y;
                this.sendAdminMessage(`Teleported to ${t.snake.nick}.`);
                break;
            }
            case 'bring': {
                const t = this._targetClient(intArg(1), 'bring');
                if (!t) break;
                if (!this.snake || this.dead) { this.sendAdminMessage('bring: you must be in-game.'); break; }
                t.snake.position.x = this.snake.position.x;
                t.snake.position.y = this.snake.position.y;
                this.sendAdminMessage(`Brought ${t.snake.nick} to you.`);
                break;
            }
            case 'createfoodat': {
                const x = floatArg(1), y = floatArg(2), n = intArg(3);
                if (x === null || y === null || n === null || n < 1) { this.sendAdminMessage('Usage: createfoodat <x> <y> <count>'); break; }
                const remaining = Math.max(0, Food.HARD_ENTITY_LIMIT - Object.keys(this.server.entities).length);
                const count = Math.min(n, remaining);
                if (count <= 0) { this.sendAdminMessage('Server is at the entity limit — cannot spawn more food.'); break; }
                for (let i = 0; i < count; i++) new Food(this.server, x + Math.random() * 10 - 5, y + Math.random() * 10 - 5, undefined, null, undefined, true);
                this.sendAdminMessage(count < n
                    ? `Spawned ${count} food at (${x}, ${y}) (capped at the ${Food.HARD_ENTITY_LIMIT}-entity server limit).`
                    : `Spawned ${count} food at (${x}, ${y}).`);
                break;
            }
            case 'killall': {
                let n = 0;
                for (const c of Object.values(this.server.clients))
                    if (c !== this && c.snake && !c.dead && this._outranks(c)) { c.snake.kill(Enums.KillReasons.BOUNDARY, c.snake); n++; }
                this.sendAdminMessage(`Killed ${n} player(s).`);
                break;
            }
            case 'freezeall': {
                let n = 0;
                for (const c of Object.values(this.server.clients)) if (c.snake && this._outranks(c)) { c.snake.frozen = true; n++; }
                this.sendAdminMessage(`Froze ${n} player(s).`);
                break;
            }
            case 'unfreezeall': {
                let n = 0;
                for (const c of Object.values(this.server.clients)) if (c.snake && c.snake.frozen) { c.snake.frozen = false; n++; }
                this.sendAdminMessage(`Unfroze ${n} player(s).`);
                break;
            }
            case 'setspeedall': {
                const v = clampedInt(1, 0, 100000);
                if (v === null) { this.sendAdminMessage('Usage: setspeedall <extraSpeed>'); break; }
                let n = 0;
                for (const c of Object.values(this.server.clients))
                    if (c.snake && this._outranks(c)) {
                        c.snake.extraSpeed = v; c.snake.speed = 0.25 + v / (255 * UPDATE_EVERY_N_TICKS); c.snake.lockspeed = v > 0; n++;
                    }
                this.sendAdminMessage(`Set extra speed of ${n} player(s) to ${v}.`);
                break;
            }
            case 'extendserver': {
                if (!this.server.isEphemeral) { this.sendAdminMessage('Not an ephemeral server.'); break; }
                this.server.lastConnectionTime = Date.now();
                this.sendAdminMessage('Idle timer reset — server lifetime extended.');
                break;
            }

            // ── Level 3: developer / server structural ────────────────────────
            case 'setservertime': {
                const mins = clampedInt(1, 1, 100000);
                if (mins === null) { this.sendAdminMessage('Usage: setservertime <minutes>'); break; }
                this.server.ephemeralLifetimeMs = mins * 60000;
                this.sendAdminMessage(`Ephemeral idle lifetime set to ${mins} minute(s).`);
                break;
            }
            case 'setmaxplayers': {
                const v = clampedInt(1, 1, 1000);
                if (v === null) { this.sendAdminMessage('Usage: setmaxplayers <1-1000>'); break; }
                this.server.MaxPlayers = v;
                this.sendAdminMessage(`Max players set to ${v}.`);
                break;
            }
            case 'setservername': {
                const name = args.slice(1).join(' ').substring(0, 30);
                if (!name) { this.sendAdminMessage('Usage: setservername <name>'); break; }
                this.server.name = name;
                this.sendAdminMessage(`Server name set to "${name}".`);
                break;
            }
            case 'setowner': {
                const id = intArg(1);
                if (id === null) { this.sendAdminMessage('Usage: setowner <userid>'); break; }
                this.server.owner = id;
                this.server.addAdmin(id);
                this.sendAdminMessage(`Server owner set to user ${id}.`);
                break;
            }
            case 'resetbans': {
                this.server.bannedIPs.clear();
                this.server.bannedUsers.clear();
                this.sendAdminMessage('All bans cleared.');
                break;
            }
            case 'setping': {
                const v = clampedInt(1, 0, 5000);
                if (v === null) { this.sendAdminMessage('Usage: setping <0-5000>'); break; }
                this.server.artificialPing = v;
                this.sendAdminMessage(`Artificial ping set to ${v}ms.`);
                break;
            }
            case 'spawnbarrier': {
                const x = floatArg(1), y = floatArg(2), w = floatArg(3), h = floatArg(4);
                if (x === null || y === null || w === null || h === null) { this.sendAdminMessage('Usage: spawnbarrier <x> <y> <width> <height>'); break; }
                this.server.barriers.push({ x, y, width: w, height: h });
                Object.values(this.server.clients).forEach(c => c.sendMapBarriers());
                this.sendAdminMessage('Barrier spawned.');
                break;
            }
            case 'clearbarriers': {
                this.server.barriers = [];
                Object.values(this.server.clients).forEach(c => c.sendMapBarriers());
                this.sendAdminMessage('All barriers cleared.');
                break;
            }

            case 'timeleft':
                if (this.server.isEphemeral) {
                    const lifetime = this.server.ephemeralLifetimeMs || 3600000;
                    const ms   = Math.max(0, lifetime - (Date.now() - this.server.lastConnectionTime));
                    const mins = Math.floor(ms / 60000);
                    const secs = Math.floor((ms % 60000) / 1000);
                    this.sendAdminMessage(`Server auto-deletes after ${mins}m ${secs}s idle.`);
                } else {
                    this.sendAdminMessage('This is not an ephemeral server.');
                }
                break;
            case 'addadmin':
                if ((this.server.isEphemeral && this._isOwner()) || level >= 3) {
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
                if ((this.server.isEphemeral && this._isOwner()) || level >= 3) {
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
                // Owner can delete their own custom server; a developer (rank ≥ 3)
                // can delete ANY server they are in.
                if (level >= 3 || (this.server.isEphemeral && this._isOwner())) {
                    this.sendAdminMessage('Deleting server...');
                    setTimeout(() => this.server.destroy(), 500);
                } else {
                    this.sendAdminMessage(this.server.isEphemeral
                        ? 'Only the server owner or a developer can delete this server.'
                        : 'Only a developer can delete this server.');
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

    /**
     * Return the position to broadcast for `entity` to THIS client.
     *
     * WHY other snakes appear "ahead"
     * ────────────────────────────────
     * Snake.turn() advances the turning snake's position forward in the new
     * direction by (ping − GlobalWebLag) × speed.  This is correct for the
     * snake's own client, but makes the snake appear too far ahead to everyone
     * else.
     *
     * WHY we roll BEHIND
     * ───────────────────
     * We subtract from the reported position along the snake's direction of
     * travel so other clients see it at the correct visual location.
     *
     * Rollback duration = max(GlobalWebLag, entityPing)
     *
     *   - Bots (ping = 0): rolls back GlobalWebLag ms worth of movement.
     *     This was the amount that made bots look correct and is the
     *     minimum baseline for any entity.
     *   - Low-ping players (ping ≤ GlobalWebLag): same GlobalWebLag rollback.
     *   - High-ping players (ping > GlobalWebLag): rolls back their actual ping
     *     worth of movement, which is larger and cancels more of the advance.
     *
     * Version 2 was wrong because:
     *   (a) it used (ping − GlobalWebLag) → 0 for bots, losing their rollback.
     *   (b) it added OtherSnakeDelay on top, overcorrecting players.
     *
     * Own snake is never adjusted — it already relies on the advance.
     */
    _broadcastPos(entity) {
        if (entity === this.snake) return entity.position;

        const lag      = this.server.config.GlobalWebLag   || 80;
        const interval = this.server.config.UpdateInterval || 100;
        const ticks    = (typeof UPDATE_EVERY_N_TICKS !== 'undefined' ? UPDATE_EVERY_N_TICKS : 3);
        const speed    = entity.speed || 0.25;
        const ping     = entity.client?.ping || 0;

        // Use at least GlobalWebLag ms as rollback so bots and low-ping players
        // match the visually-correct amount.  High-ping players use their actual
        // ping, which cancels more of the larger advance turn() applied for them.
        const rollbackMs = Math.max(lag, Math.min(ping, 500));
        const rollback   = speed * ticks * (rollbackMs / interval);

        let { x, y } = entity.position;
        switch (entity.direction) {
            case Enums.Directions.UP:    y -= rollback; break;
            case Enums.Directions.DOWN:  y += rollback; break;
            case Enums.Directions.RIGHT: x -= rollback; break;
            case Enums.Directions.LEFT:  x += rollback; break;
        }
        return { x, y };
    }

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

    // Tell the client its effective permission level + role flags for THIS
    // server so the admin panel can show the appropriate controls. Purely for
    // UX — every command is still re-validated server-side in _handleCommand.
    sendPermissions() {
        const isDevServer = this.server.isDevServer ? 1 : 0;
        const isOwner = this._isOwner() ? 1 : 0;
        // "Developer" status unlocks dev-only panel controls — true for a global
        // rank-3 user OR anyone on a dev server (where everyone is level 3).
        const isDev   = ((this.user && (this.user.rank || 0) >= 3) || isDevServer) ? 1 : 0;
        const isEph   = this.server.isEphemeral ? 1 : 0;
        this._send(w => {
            w.writeUint8(Enums.ServerToClient.OPCODE_PERMISSIONS);
            w.writeUint8(this.permissionLevel());
            w.writeUint8(isOwner);
            w.writeUint8(isDev);
            w.writeUint8(isEph);
            w.writeUint8(isDevServer);
        }, 8);
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

    _buildClearChatPacket() {
        const w = new BinaryWriter(1);
        w.writeUint8(Enums.ServerToClient.OPCODE_CLEAR_CHAT);
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
                        // Use adjusted position for other snakes so they render
                        // at the correct visual location, not the server-side
                        // latency-compensated position (which is too far ahead).
                        const bp = this._broadcastPos(entity);
                        w.writeFloat32(bp.x);
                        w.writeFloat32(bp.y);
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
                        // Packed RGB (0xRRGGBB) so food can be any colour incl.
                        // black; client reads this as a uint32 (see Food.updateNetwork).
                        w.writeUint32(entity.colorRGB >>> 0);
                    }

                    this.loadedEntities[entity.id] = entity;
                    break;
                }

                // ── incremental update ─────────────────────────────────────────
                case Enums.UpdateTypes.UPDATE_TYPE_PARTIAL: {
                    if (entity.type === Enums.EntityTypes.ENTITY_PLAYER) {
                        const bp = this._broadcastPos(entity);
                        w.writeFloat32(bp.x);
                        w.writeFloat32(bp.y);
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
