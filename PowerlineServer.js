require('dotenv').config();
const fs   = require('fs');
const url  = require('url');
const http = require('http');
const WebSocket = require('ws');

const { SnakeFunctions } = require('./modules/EntityFunctions.js');
const Server             = require('./modules/Server.js');
const DatabaseFunctions  = require('./modules/DatabaseFunctions.js');
const Bot                = require('./modules/Bot.js');
const AntiBotTracker     = require('./modules/AntiBotTracker.js');

DBFunctions = new DatabaseFunctions();

// ── global helpers sent to modules ───────────────────────────────────────────

global.getString = function (data, bitOffset) {
    let nick = '';
    // Guard against a packet with no null terminator — without the bounds check
    // getUint16 throws RangeError, which becomes an unhandled promise rejection
    // and crashes the Node.js process.
    while (bitOffset + 2 <= data.byteLength) {
        const code = data.getUint16(bitOffset, true);
        bitOffset += 2;
        if (code === 0) break;
        nick += String.fromCharCode(code);
    }
    return { string: nick, offset: bitOffset };
};

// ── game constants ────────────────────────────────────────────────────────────

UPDATE_EVERY_N_TICKS = 3;

// ── custom snake colour presets ───────────────────────────────────────────────

customPlayerColors = {
    'Dracula': {
        customHead: ``,
        customBody: `
            context.shadowColor = 'rgba(255,0,0, 1)';
            context.lineWidth = (w)*this.snakeScale;
            context.strokeStyle = 'rgba(0,0,0, 1)';
            this.drawTail(this.renderedPoints, context);
            shadowBlur = 0;
        `,
        customTail: ``,
    },
    'Sun': {
        customHead: ``,
        customBody: `
            context.strokeStyle = 'rgba(255, 235, 161, 1)';
            context.shadowColor = 'rgba(227, 182, 18, 1)';
            let point = this.renderedPoints[0];
            let gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, w*this.snakeScale*5);
            gradient.addColorStop(0, 'rgba(227, 182, 18,1)');
            gradient.addColorStop(1, 'rgba(227, 182, 18,0)');
            context.fillStyle = gradient;
            context.beginPath();
            context.arc(point.x, point.y, w*this.snakeScale*5, 0, Math.PI * 2);
            context.fill();
        `,
        customTail: ``,
    },
    'Rainbow': {
        customHead: ``,
        customBody: `
            let pts = this.renderedPoints;
            if (pts.length > 1) {
                context.save();
                context.lineWidth = w * this.snakeScale;
                context.lineCap = 'round';
                context.lineJoin = 'round';
                context.shadowBlur = 14;
                context.shadowColor = 'rgba(255,255,255,0.8)';
                let totalDist = 0;
                let rainbowLength = 120;
                let speed = Date.now() / 25;
                for (let i = 0; i < pts.length - 1; i++) {
                    let p1 = pts[i], p2 = pts[i + 1];
                    let dx = p2.x - p1.x, dy = p2.y - p1.y;
                    let dist = Math.sqrt(dx * dx + dy * dy);
                    let hue1 = (speed + totalDist * 360 / rainbowLength) % 360;
                    let hue2 = (speed + (totalDist + dist) * 360 / rainbowLength) % 360;
                    let grad = context.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
                    grad.addColorStop(0, 'hsl(' + hue1 + ', 100%, 55%)');
                    grad.addColorStop(1, 'hsl(' + hue2 + ', 100%, 55%)');
                    context.beginPath();
                    context.moveTo(p1.x, p1.y);
                    context.lineTo(p2.x, p2.y);
                    context.strokeStyle = grad;
                    context.stroke();
                    totalDist += dist;
                }
                context.restore();
            }
            context.strokeStyle = 'rgba(0,0,0,0)';
            context.shadowBlur = 0;
        `,
        customTail: ``,
    },
    'Pastel': {
        customHead: ``,
        customBody: `
            context.save();
            context.lineWidth = w * this.snakeScale;
            context.lineCap = 'round';
            context.lineJoin = 'round';
            let pts = this.renderedPoints;
            let grad = context.createLinearGradient(pts[0].x, pts[0].y, pts[pts.length-1].x, pts[pts.length-1].y);
            grad.addColorStop(0, 'rgba(255,0,180,1)');
            grad.addColorStop(0.5, 'rgba(0,255,255,1)');
            grad.addColorStop(1, 'rgba(255,230,0,1)');
            context.strokeStyle = grad;
            context.shadowColor = 'rgba(0,255,255,1)';
            context.shadowBlur = 18;
            this.drawTail(this.renderedPoints, context);
            context.lineWidth = (w * 0.35) * this.snakeScale;
            context.strokeStyle = 'rgba(255,255,255,0.7)';
            context.shadowBlur = 0;
            this.drawTail(this.renderedPoints, context);
            context.restore();
            context.strokeStyle = 'rgba(0,0,0,0)';
        `,
        customTail: ``,
    },
    'Void': {
        customHead: ``,
        customBody: `
            context.save();
            context.lineWidth = (w + 1.5) * this.snakeScale;
            context.strokeStyle = 'rgba(110,0,255,1)';
            context.shadowColor = 'rgba(140,0,255,1)';
            context.shadowBlur = 22;
            this.drawTail(this.renderedPoints, context);
            context.lineWidth = w * this.snakeScale;
            context.strokeStyle = 'rgba(5,0,15,1)';
            context.shadowColor = 'rgba(0,0,0,1)';
            context.shadowBlur = 6;
            this.drawTail(this.renderedPoints, context);
            context.restore();
            context.strokeStyle = 'rgba(0,0,0,0)';
            context.shadowBlur = 0;
        `,
        customTail: ``,
    },
    'Laser': {
        customHead: ``,
        customBody: `
            context.save();
            context.lineWidth = w * this.snakeScale;
            context.strokeStyle = 'rgba(0,20,30,1)';
            context.shadowColor = 'rgba(0,255,255,1)';
            context.shadowBlur = 12;
            this.drawTail(this.renderedPoints, context);
            context.lineWidth = (w * 0.55) * this.snakeScale;
            context.setLineDash([w * 1.8, w * 1.1]);
            context.lineDashOffset = -Date.now() / 35;
            context.strokeStyle = 'rgba(0,255,255,1)';
            this.drawTail(this.renderedPoints, context);
            context.setLineDash([]);
            context.restore();
            context.strokeStyle = 'rgba(0,0,0,0)';
            context.shadowBlur = 0;
        `,
        customTail: ``,
    },
    'Gold': {
        customHead: ``,
        customBody: `
            let pts = this.renderedPoints;
            context.save();
            let grad = context.createLinearGradient(pts[0].x, pts[0].y, pts[pts.length-1].x, pts[pts.length-1].y);
            grad.addColorStop(0,    'rgba(255,180,0,1)');
            grad.addColorStop(0.35, 'rgba(255,255,180,1)');
            grad.addColorStop(0.7,  'rgba(180,90,0,1)');
            grad.addColorStop(1,    'rgba(255,220,80,1)');
            context.lineWidth = w * this.snakeScale;
            context.strokeStyle = grad;
            context.shadowColor = 'rgba(255,190,0,1)';
            context.shadowBlur = 16;
            this.drawTail(this.renderedPoints, context);
            context.restore();
            context.strokeStyle = 'rgba(0,0,0,0)';
            context.shadowBlur = 0;
        `,
        customTail: ``,
    },
    'Matrix': {
        customHead: ``,
        customBody: `
            context.save();
            context.lineWidth = w * this.snakeScale;
            context.strokeStyle = 'rgba(0,40,0,1)';
            context.shadowColor = 'rgba(0,255,60,1)';
            context.shadowBlur = 14;
            this.drawTail(this.renderedPoints, context);
            context.lineWidth = (w * 0.45) * this.snakeScale;
            context.setLineDash([w * 0.7, w * 1.2]);
            context.lineDashOffset = Date.now() / 30;
            context.strokeStyle = 'rgba(120,255,120,1)';
            this.drawTail(this.renderedPoints, context);
            context.setLineDash([]);
            context.restore();
            context.strokeStyle = 'rgba(0,0,0,0)';
            context.shadowBlur = 0;
        `,
        customTail: ``,
    },
    'Fire And Ice': {
        customHead: ``,
        customBody: `
            let pts = this.renderedPoints;
            context.save();
            let grad = context.createLinearGradient(pts[0].x, pts[0].y, pts[pts.length-1].x, pts[pts.length-1].y);
            grad.addColorStop(0,    'rgba(255,50,0,1)');
            grad.addColorStop(0.45, 'rgba(255,220,80,1)');
            grad.addColorStop(0.55, 'rgba(180,240,255,1)');
            grad.addColorStop(1,    'rgba(0,160,255,1)');
            context.lineWidth = w * this.snakeScale;
            context.strokeStyle = grad;
            context.shadowColor = 'rgba(100,200,255,1)';
            context.shadowBlur = 18;
            this.drawTail(this.renderedPoints, context);
            context.restore();
            context.strokeStyle = 'rgba(0,0,0,0)';
            context.shadowBlur = 0;
        `,
        customTail: ``,
    },
};

// ── server config defaults ────────────────────────────────────────────────────

defaultConfig = {
    ConfigType:          160,
    ArenaSize:           300,
    DefaultZoom:         2,
    MinimumZoom:         1.5,
    MinimumZoomScore:    100,
    ZoomLevel2:          10,
    GlobalWebLag:        90,
    GlobalMobileLag:     60,
    OtherSnakeDelay:     40,
    IsTalkEnabled:       1,
    FoodValue:           1.5,
    UpdateInterval:      100,
    MaxBoostSpeed:       255,
    MaxRubSpeed:         200,
    DefaultLength:       10,
};

SCORE_MULTIPLIER = 10 / defaultConfig.FoodValue;

// ── ephemeral server tracking ─────────────────────────────────────────────────

global.ephemeralServers = new Map(); // userId → serverId
let nextEphemeralId = 5000;

const EPHEMERAL_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

// Auto-cleanup idle ephemeral servers every 5 minutes
setInterval(() => {
    if (typeof Servers === 'undefined') return;
    for (const [userId, serverId] of global.ephemeralServers) {
        const server = Servers[serverId];
        if (!server) { global.ephemeralServers.delete(userId); continue; }
        const idle = Object.keys(server.clients).length === 0 &&
                     (Date.now() - server.lastConnectionTime) > EPHEMERAL_TIMEOUT_MS;
        if (idle) {
            console.log(`Auto-deleting idle ephemeral server ${serverId} (owner: ${userId})`);
            server.destroy();
        }
    }
}, 5 * 60 * 1000);

// ── HTTP helpers ──────────────────────────────────────────────────────────────

// The single origin permitted to make cross-origin credentialed requests.
// Set CORS_ORIGIN in your .env to the game's public URL (e.g. https://powerline.io).
// If left unset no cross-origin access is granted at all, which is safe by default.
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || null;

/**
 * Build CORS response headers.
 * Only the exact origin declared in CORS_ORIGIN is reflected back.
 * Reflecting the request's Origin header verbatim (old behaviour) allows any
 * site to make credentialed cross-origin requests and read the responses.
 * @param {string} methods  - comma-separated allowed methods
 */
function corsHeaders(req, methods = 'GET') {
    const headers = {
        'Access-Control-Allow-Methods': methods,
        'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (ALLOWED_ORIGIN) {
        headers['Access-Control-Allow-Origin']      = ALLOWED_ORIGIN;
        headers['Access-Control-Allow-Credentials'] = 'true';
    }
    return headers;
}

/**
 * Send a JSON response (with CORS headers).
 */
function sendJSON(req, res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json', ...corsHeaders(req) });
    res.end(typeof data === 'string' ? data : JSON.stringify(data));
}

function sendOK(req, res, data)    { sendJSON(req, res, 200, data); }
function sendError(req, res, code, message) {
    sendJSON(req, res, code, { success: false, message });
}

/** Return a promise that resolves to the request body as a string. */
function readBody(req) {
    return new Promise(resolve => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end',  () => resolve(Buffer.concat(chunks).toString()));
    });
}

/** Parse session cookie and return the authenticated user, or null. */
async function getUserFromRequest(req) {
    // Dev bypass: no OAuth needed for local testing
    if (process.env.DEV_SKIP_AUTH === 'true') {
        return { userid: 9999, username: 'DevUser', rank: 10, verified_name: 'DevUser' };
    }
    const cookies = req.headers.cookie || '';
    const match   = cookies.split(';').find(c => c.trim().startsWith('session_id='));
    if (!match) return null;
    const session = match.trim().split('=')[1];
    if (!session) return null;
    return DBFunctions.GetUserFromSession(session);
}

// ── individual route handlers ─────────────────────────────────────────────────

const routes = {};

// OPTIONS preflight — shared across most routes
function handleOptions(req, res, methods) {
    res.writeHead(204, corsHeaders(req, methods));
    res.end();
}

routes.heartbeat = async (req, res) => {
    if (req.method === 'OPTIONS') return handleOptions(req, res, 'POST');
    if (req.method !== 'POST')    return sendError(req, res, 405, 'Method not allowed');

    const body = await readBody(req);
    const json = JSON.parse(body);
    if (!json.name) return sendError(req, res, 400, 'No server name provided');

    const host = json.hostname || req.connection.remoteAddress;
    const key  = `${host}:${json.port}`;
    let entry  = remoteServers.find(s => s.host === key);
    if (entry) {
        entry.name = json.name;
        entry.lastHeartbeat = Date.now();
    } else {
        remoteServers.push({ name: json.name, host: key, type: 'remote', lastHeartbeat: Date.now() });
    }
    sendOK(req, res, { success: true });
};

routes.getservers = (req, res) => {
    if (req.method === 'OPTIONS') return handleOptions(req, res, 'GET');
    if (req.method !== 'GET')     return sendError(req, res, 405, 'Method not allowed');

    // Expire remote servers not seen in 30 s
    remoteServers = remoteServers.filter(s => Date.now() - s.lastHeartbeat < 30000);

    const local = Object.values(Servers).map(server => {
        const cfg = { ...server.config };
        cfg.FoodValue = SnakeFunctions.LengthToScore(cfg.FoodValue);
        return {
            id:          server.id,
            name:        server.name,
            owner:       server.owner,
            maxplayers:  server.MaxPlayers,
            pinned:      server.pinned,
            type:        server.isEphemeral ? 'custom' : undefined,
            playerCount: Object.values(server.snakes).filter(s => !s.client.isBot).length,
            config:      JSON.stringify(cfg, null, 4),
        };
    });

    sendOK(req, res, local.concat(remoteServers));
};

routes.fetchuser = async (req, res) => {
    if (req.method === 'OPTIONS') return handleOptions(req, res, 'GET');
    if (req.method !== 'GET')     return sendError(req, res, 405, 'Method not allowed');

    const qs      = req.url.split('?')[1] || '';
    const userIds = qs.split('&').map(p => p.split('=')[1]).filter(Boolean);
    if (userIds.length === 0) return sendError(req, res, 400, 'No user id provided');

    const users = await DBFunctions.GetUsers(userIds);
    sendOK(req, res, users);
};

routes.fetchservers = (req, res) => {
    if (req.method === 'OPTIONS') return handleOptions(req, res, 'GET');
    if (req.method !== 'GET')     return sendError(req, res, 405, 'Method not allowed');

    const data = fs.readFileSync('./servers.json', 'utf8');
    sendOK(req, res, JSON.parse(data));
};

routes.searchuser = async (req, res) => {
    if (req.method === 'OPTIONS') return handleOptions(req, res, 'GET, OPTIONS');
    if (req.method !== 'GET')     return sendError(req, res, 405, 'Method not allowed');

    try {
        const qs     = req.url.split('?')[1] || '';
        const param  = qs.split('&').find(p => p.startsWith('q='));
        const term   = param ? decodeURIComponent(param.slice(2)) : '';
        if (term.length < 2) return sendOK(req, res, []);

        const users = await DBFunctions.SearchUsers(term);
        sendOK(req, res, users || []);
    } catch {
        sendError(req, res, 500, 'Internal server error.');
    }
};

routes.setverifiedname = async (req, res) => {
    if (req.method === 'OPTIONS') return handleOptions(req, res, 'POST, OPTIONS');
    if (req.method !== 'POST')    return sendError(req, res, 405, 'Method not allowed');

    try {
        const user = await getUserFromRequest(req);
        if (!user) return sendError(req, res, 401, 'You must be logged in.');

        let json = {};
        try { json = JSON.parse(await readBody(req)); } catch {}

        const name = (json.name || '').trim();
        // Validate: 1–25 characters, letters and digits only
        if (!/^[A-Za-z0-9]{1,25}$/.test(name)) {
            return sendError(req, res, 400, 'Name must be 1–25 characters (letters and numbers only).');
        }

        const available = await DBFunctions.CheckVerifiedNameAvailable(name);
        if (!available) {
            return sendError(req, res, 409, 'That name is already taken. Please choose another.');
        }

        await DBFunctions.SetVerifiedName(user.userid, name);
        sendOK(req, res, { success: true });
    } catch (err) {
        console.error('setverifiedname error:', err);
        sendError(req, res, 500, 'Internal server error.');
    }
};

routes.createserver = async (req, res) => {
    if (req.method === 'OPTIONS') return handleOptions(req, res, 'POST, OPTIONS');
    if (req.method !== 'POST')    return sendError(req, res, 405, 'Method not allowed');

    try {
        const user = await getUserFromRequest(req);
        if (!user) return sendError(req, res, 401, 'You must be logged in to create a server.');

        const uid = parseInt(user.userid);
        if (global.ephemeralServers.has(uid)) {
            const existId = global.ephemeralServers.get(uid);
            if (Servers[existId]) return sendError(req, res, 400, 'You already have a custom server. Delete it first.');
            global.ephemeralServers.delete(uid);
        }

        let json = {};
        try { json = JSON.parse(await readBody(req)); } catch {}

        const serverName    = (json.name          || `${user.verified_name || 'Custom'}'s Server`).substring(0, 30);
        const maxPlayers    = Math.min(Math.max(parseInt(json.maxPlayers)    || 10,  1), 100);
        const foodValue     = Math.min(Math.max(parseFloat(json.foodValue)   || 10,  1), 100);
        const defaultLength = Math.min(Math.max(parseInt(json.defaultLength) || 10,  1), 200);
        const arenaSize     = Math.min(Math.max(parseInt(json.arenaSize)     || 300, 50), 2000);

        while (Servers[nextEphemeralId]) nextEphemeralId++;
        const newId = nextEphemeralId++;

        Servers[newId] = new Server({
            id: newId, name: serverName, maxplayers: maxPlayers,
            owner: user.userid, type: 'custom', isEphemeral: true, pinned: false,
            config: {
                ...defaultConfig,
                FoodValue:     SnakeFunctions.ScoreToLength(foodValue),
                DefaultLength: defaultLength,
                ArenaSize:     arenaSize,
            },
        });
        global.ephemeralServers.set(uid, newId);
        console.log(`Created ephemeral server ${newId} for user ${uid} (${user.username})`);
        sendOK(req, res, { success: true, serverId: newId });
    } catch (err) {
        console.error('createserver error:', err);
        sendError(req, res, 500, 'Internal server error.');
    }
};

routes.deleteserver = async (req, res) => {
    if (req.method === 'OPTIONS') return handleOptions(req, res, 'POST, OPTIONS');
    if (req.method !== 'POST')    return sendError(req, res, 405, 'Method not allowed');

    try {
        await readBody(req); // drain
        const user = await getUserFromRequest(req);
        if (!user) return sendError(req, res, 401, 'You must be logged in.');

        const serverId = global.ephemeralServers.get(parseInt(user.userid));
        if (!serverId || !Servers[serverId]) return sendError(req, res, 404, "You don't have a custom server.");

        Servers[serverId].destroy();
        sendOK(req, res, { success: true });
    } catch (err) {
        console.error('deleteserver error:', err);
        sendError(req, res, 500, 'Internal server error.');
    }
};

routes.myserver = async (req, res) => {
    if (req.method === 'OPTIONS') return handleOptions(req, res, 'GET, OPTIONS');
    if (req.method !== 'GET')     return sendError(req, res, 405, 'Method not allowed');

    try {
        const user = await getUserFromRequest(req);
        if (!user) return sendError(req, res, 401, 'You must be logged in.');

        const serverId = global.ephemeralServers.get(parseInt(user.userid));
        if (!serverId || !Servers[serverId]) return sendOK(req, res, { success: true, server: null });

        const server    = Servers[serverId];
        const timeLeft  = Math.max(0, EPHEMERAL_TIMEOUT_MS - (Date.now() - server.lastConnectionTime));
        const cfg       = { ...server.config };
        cfg.FoodValue   = SnakeFunctions.LengthToScore(cfg.FoodValue);

        sendOK(req, res, {
            success: true,
            server: {
                id:          server.id,
                name:        server.name,
                maxplayers:  server.MaxPlayers,
                playerCount: Object.values(server.snakes).filter(s => !s.client.isBot).length,
                admins:      server.admins,
                timeLeftMs:  timeLeft,
                config:      JSON.stringify(cfg, null, 4),
            },
        });
    } catch (err) {
        console.error('myserver error:', err);
        sendError(req, res, 500, 'Internal server error.');
    }
};

routes.addadmin = async (req, res) => {
    if (req.method === 'OPTIONS') return handleOptions(req, res, 'POST, OPTIONS');
    if (req.method !== 'POST')    return sendError(req, res, 405, 'Method not allowed');

    try {
        const user = await getUserFromRequest(req);
        if (!user) return sendError(req, res, 401, 'You must be logged in.');

        const serverId = global.ephemeralServers.get(parseInt(user.userid));
        if (!serverId || !Servers[serverId]) return sendError(req, res, 404, "You don't have a custom server.");

        let json = {};
        try { json = JSON.parse(await readBody(req)); } catch {}
        const adminId = parseInt(json.userId);
        if (isNaN(adminId)) return sendError(req, res, 400, 'Invalid user id.');

        sendOK(req, res, { success: true, added: Servers[serverId].addAdmin(adminId) });
    } catch {
        sendError(req, res, 500, 'Internal server error.');
    }
};

routes.removeadmin = async (req, res) => {
    if (req.method === 'OPTIONS') return handleOptions(req, res, 'POST, OPTIONS');
    if (req.method !== 'POST')    return sendError(req, res, 405, 'Method not allowed');

    try {
        const user = await getUserFromRequest(req);
        if (!user) return sendError(req, res, 401, 'You must be logged in.');

        const serverId = global.ephemeralServers.get(parseInt(user.userid));
        if (!serverId || !Servers[serverId]) return sendError(req, res, 404, "You don't have a custom server.");

        let json = {};
        try { json = JSON.parse(await readBody(req)); } catch {}
        const adminId = parseInt(json.userId);
        if (isNaN(adminId)) return sendError(req, res, 400, 'Invalid user id.');

        sendOK(req, res, { success: true, removed: Servers[serverId].removeAdmin(adminId) });
    } catch {
        sendError(req, res, 500, 'Internal server error.');
    }
};

// ── HTTP dispatcher ───────────────────────────────────────────────────────────

let remoteServers = [];

async function serverListener(req, res) {
    // Strip .php suffix so PHP proxy files route to the same handlers
    let path = req.url.split('/')[1] || '';
    path = path.includes('?') ? path.split('?')[0] : path;
    path = path.replace(/\.php$/, '');

    const handler = routes[path];
    if (handler) {
        try {
            await handler(req, res);
        } catch (err) {
            console.error(`Unhandled error in /${path}:`, err);
            sendError(req, res, 500, 'Internal server error.');
        }
    } else {
        console.log('404:', req.url);
        sendError(req, res, 404, 'Endpoint not found');
    }
}

// ── WebSocket server ──────────────────────────────────────────────────────────

const httpServer = http.createServer(serverListener).listen(1335, '127.0.0.1');
const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (ws, req) => {
    try {
        // ── per-IP connection gate ────────────────────────────────────────────
        // Use the real remote address — don't trust X-Forwarded-For because bots
        // can spoof headers, whereas the TCP remote address is harder to fake when
        // connecting directly.  For NAT'd networks (schools, offices) all students
        // share one IP, so the limit of 30 is intentionally generous.
        const clientIP = req.socket.remoteAddress || '::1';

        if (!AntiBotTracker.isConnectionAllowed(clientIP)) {
            ws.close(1008, 'Too many connections from your network');
            return;
        }

        AntiBotTracker.onConnected(clientIP);
        // Store on the socket so Client.js can access it without importing
        // PowerlineServer.js (avoiding a circular dependency).
        ws._clientIP = clientIP;

        // Release the slot when the socket closes (fires whether finalize ran or not)
        ws.on('close', () => AntiBotTracker.onDisconnected(clientIP));

        // ── server routing ────────────────────────────────────────────────────
        const parsed = url.parse(req.url, true);
        if (parsed.pathname !== '/ws') { ws.close(1008, 'Invalid websocket path'); return; }

        const serverId = parsed.query.server;
        if (!serverId)  { ws.close(1008, 'Missing server id');  return; }

        const target = Servers[serverId];
        if (!target)    { ws.close(1008, 'Invalid server id');   return; }

        target.attachWebSocket(ws, req);
    } catch (err) {
        console.error('WebSocket routing error:', err);
        try { ws.close(1011, 'Internal server error'); } catch {}
    }
});

// ── server registry ───────────────────────────────────────────────────────────

Servers = [];

fs.readFile('./servers.json', 'utf8', (err, data) => {
    if (err) return console.error('Error reading servers.json:', err);
    const servers = JSON.parse(data);
    for (const s of servers) Servers[s.id] = new Server(s);
    console.log(`servers.json loaded (${servers.length} servers)`);
});
