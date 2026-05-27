require('dotenv').config();
const { SnakeFunctions } = require("./modules/EntityFunctions.js");
const Server = require("./modules/Server.js");
const fs = require("fs");
const DatabaseFunctions = require("./modules/DatabaseFunctions.js");
const Bot = require("./modules/Bot.js");
const url = require("url");
const WebSocket = require("ws");

DBFunctions = new DatabaseFunctions();

global.getString = function (data, bitOffset) {
    var nick = "";
    while (true) {
        var charCode = data.getUint16(bitOffset, true);
        bitOffset += 2;
        if (0 == charCode) break;
        nick += String.fromCharCode(charCode);
    }
    return { string: nick, offset: bitOffset };
}

customPlayerColors = {
    "Dracula": {
        customHead: ``,
        customBody: `
            context.shadowColor = 'rgba(255,0,0, 1)';
            context.lineWidth = (w)*this.snakeScale;
			context.strokeStyle = 'rgba(0,0,0, 1)';
			this.drawTail(this.renderedPoints, context);
            shadowBlur = 0;
        `,
        customTail: ``
    },
    "Sun": {
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
        customTail: ``
    },
    "Rainbow": {
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
                let rainbowLength = 120; // lower = faster color cycling
                let speed = Date.now() / 25;

                for (let i = 0; i < pts.length - 1; i++) {
                    let p1 = pts[i];
                    let p2 = pts[i + 1];

                    let dx = p2.x - p1.x;
                    let dy = p2.y - p1.y;
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
        customTail: ``
    },

    "Pastel": {
        customHead: ``,
        customBody: `
            context.save();
            context.lineWidth = w * this.snakeScale;
            context.lineCap = 'round';
            context.lineJoin = 'round';

            let pts = this.renderedPoints;
            let grad = context.createLinearGradient(pts[0].x, pts[0].y, pts[pts.length - 1].x, pts[pts.length - 1].y);
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
        customTail: ``
    },

    "Void": {
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
        customTail: ``
    },

    "Laser": {
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
        customTail: ``
    },

    "Gold": {
        customHead: ``,
        customBody: `
            let pts = this.renderedPoints;
            context.save();

            let grad = context.createLinearGradient(pts[0].x, pts[0].y, pts[pts.length - 1].x, pts[pts.length - 1].y);
            grad.addColorStop(0, 'rgba(255,180,0,1)');
            grad.addColorStop(0.35, 'rgba(255,255,180,1)');
            grad.addColorStop(0.7, 'rgba(180,90,0,1)');
            grad.addColorStop(1, 'rgba(255,220,80,1)');

            context.lineWidth = w * this.snakeScale;
            context.strokeStyle = grad;
            context.shadowColor = 'rgba(255,190,0,1)';
            context.shadowBlur = 16;
            this.drawTail(this.renderedPoints, context);

            context.restore();

            context.strokeStyle = 'rgba(0,0,0,0)';
            context.shadowBlur = 0;
        `,
        customTail: ``
    },

    "Matrix": {
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
        customTail: ``
    },

    "Fire And Ice": {
        customHead: ``,
        customBody: `
            let pts = this.renderedPoints;
            context.save();

            let grad = context.createLinearGradient(pts[0].x, pts[0].y, pts[pts.length - 1].x, pts[pts.length - 1].y);
            grad.addColorStop(0, 'rgba(255,50,0,1)');
            grad.addColorStop(0.45, 'rgba(255,220,80,1)');
            grad.addColorStop(0.55, 'rgba(180,240,255,1)');
            grad.addColorStop(1, 'rgba(0,160,255,1)');

            context.lineWidth = w * this.snakeScale;
            context.strokeStyle = grad;
            context.shadowColor = 'rgba(100,200,255,1)';
            context.shadowBlur = 18;
            this.drawTail(this.renderedPoints, context);

            context.restore();

            context.strokeStyle = 'rgba(0,0,0,0)';
            context.shadowBlur = 0;
        `,
        customTail: ``
    },
}

defaultConfig = {
    "ConfigType": 160,
    "ArenaSize": 300,
    "DefaultZoom": 2,
    "MinimumZoom": 1.5,
    "MinimumZoomScore": 100,
    "ZoomLevel2": 10,
    "GlobalWebLag": 90,
    "GlobalMobileLag": 60,
    "OtherSnakeDelay": 40,
    "IsTalkEnabled": 1,

    "FoodValue": 1.5,
    "UpdateInterval": 100,
    "MaxBoostSpeed": 255,
    "MaxRubSpeed": 200,
    "DefaultLength": 10,
}

UPDATE_EVERY_N_TICKS = 3;
SCORE_MULTIPLIER = 10 / defaultConfig.FoodValue;

// Ephemeral server tracking: userId (number) -> serverId (number)
global.ephemeralServers = new Map();
let nextEphemeralId = 5000;

const EPHEMERAL_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

// Auto-cleanup: check every 5 minutes for idle ephemeral servers
setInterval(() => {
    if (typeof Servers === 'undefined') return;
    for (const [userId, serverId] of global.ephemeralServers.entries()) {
        const server = Servers[serverId];
        if (!server) {
            global.ephemeralServers.delete(userId);
            continue;
        }
        const hasClients = Object.keys(server.clients).length > 0;
        if (!hasClients && (Date.now() - server.lastConnectionTime) > EPHEMERAL_TIMEOUT_MS) {
            console.log(`Auto-deleting idle ephemeral server ${serverId} (owner: ${userId})`);
            server.destroy();
        }
    }
}, 5 * 60 * 1000);

// Helper: parse session cookie from request headers
async function getUserFromRequest(req) {
    const cookies = req.headers.cookie;
    if (!cookies) return null;
    const sessionCookie = cookies.split(";").find(c => c.trim().includes("session_id="));
    if (!sessionCookie) return null;
    const session = sessionCookie.trim().split("=")[1];
    if (!session) return null;
    return await DBFunctions.GetUserFromSession(session);
}

const HttpServer = require('http').createServer;

function sendBadResponse(req, res, code, message) {
    res.writeHead(code, {
        'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
        'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': true
    });
    res.end(JSON.stringify({
        success: false,
        message: message
    }));
}

let remoteServers = [];

async function serverListener(req, res) {
    let directory = req.url.split("/")[1];
    if (directory.includes("?"))
        directory = directory.split("?")[0];

    switch (directory) {
        case "heartbeat":
            switch (req.method) {
                case "OPTIONS":
                    res.writeHead(204, {
                        'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                        'Access-Control-Allow-Methods': 'POST',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Credentials': true
                    });
                    res.end();
                    break;
                case "POST":
                    let body = '';
                    req.on('data', chunk => {
                        body += chunk.toString();
                    });
                    req.on('end', async () => {
                        let json = JSON.parse(body);
                        if (!json.name) {
                            sendBadResponse(req, res, 400, "No server name provided");
                            return;
                        }

                        let host = json.hostname || req.connection.remoteAddress;
                        let containsDuplicate = remoteServers.find(server => server.host == `${host}:${json.port}`);
                        if (!containsDuplicate) {
                            remoteServers.push({
                                name: json.name,
                                host: `${host}:${json.port}`,
                                type: "remote",
                                lastHeartbeat: Date.now(),
                            });
                        } else {
                            containsDuplicate.name = json.name;
                            containsDuplicate.lastHeartbeat = Date.now();
                        }

                        res.writeHead(200, {
                            'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                            'Access-Control-Allow-Methods': 'POST',
                            'Access-Control-Allow-Headers': 'Content-Type',
                            'Access-Control-Allow-Credentials': true
                        });
                        res.end(JSON.stringify({ success: true }));
                    });
                    break;
                default:
                    sendBadResponse(req, res, 405, "Method not allowed");
                    break;
            }
            break;

        case "getservers":
            switch (req.method) {
                case "OPTIONS":
                    res.writeHead(204, {
                        'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                        'Access-Control-Allow-Methods': 'GET',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Credentials': true
                    });
                    res.end();
                    break;
                case "GET":
                    let servers = Object.values(Servers).map(server => {
                        let thisConfig = JSON.parse(JSON.stringify(server.config));
                        thisConfig.FoodValue = SnakeFunctions.LengthToScore(thisConfig.FoodValue);
                        return {
                            id: server.id,
                            name: server.name,
                            owner: server.owner,
                            maxplayers: server.MaxPlayers,
                            pinned: server.pinned,
                            type: server.isEphemeral ? "custom" : undefined,
                            playerCount: Object.keys(server.snakes).length,
                            config: JSON.stringify(thisConfig, true, 4)
                        };
                    });

                    remoteServers = remoteServers.filter(server => {
                        return (Date.now() - server.lastHeartbeat) < 30000;
                    });

                    servers = servers.concat(remoteServers);

                    res.writeHead(200, {
                        'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                        'Access-Control-Allow-Methods': 'GET',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Credentials': true
                    });
                    res.end(JSON.stringify(servers, true, 4));
                    break;
                default:
                    res.writeHead(200, {
                        'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                        'Access-Control-Allow-Methods': 'GET',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Credentials': true
                    });
                    res.end(`Cannot ${req.method} /${req.url.split("/")[1]}`);
                    break;
            }
            break;

        case "fetchuser":
            switch (req.method) {
                case "OPTIONS":
                    res.writeHead(204, {
                        'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                        'Access-Control-Allow-Methods': 'GET',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Credentials': true
                    });
                    res.end();
                    break;
                case "GET":
                    let queryStrings = req.url.split("?")[1];
                    if (!queryStrings) {
                        sendBadResponse(req, res, 400, "No user id provided");
                        return;
                    }
                    if (queryStrings.split("&").length == 0) {
                        sendBadResponse(req, res, 400, "No user id provided");
                        return;
                    }

                    let userIds = req.url.split("?")[1].split("&").map((id) => id.split("=")[1]);
                    if (userIds.length == 0) {
                        sendBadResponse(req, res, 400, "User ids provided are invalid");
                        return;
                    }
                    if (userIds.length > Servers.length) {
                        sendBadResponse(req, res, 400, "Too many user ids provided");
                        return;
                    }

                    let users = await DBFunctions.GetUsers(userIds);
                    res.writeHead(200, {
                        'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                        'Access-Control-Allow-Methods': 'GET',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Credentials': true
                    });
                    res.end(users);
                    break;
            }
            break;

        case "fetchservers":
            switch (req.method) {
                case "OPTIONS":
                    res.writeHead(204, {
                        'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                        'Access-Control-Allow-Methods': 'GET',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Credentials': true
                    });
                    res.end();
                    break;
                case "GET":
                    let serversFile = fs.readFileSync('./servers.json', 'utf8');
                    let servers = JSON.parse(serversFile);
                    res.writeHead(200, {
                        'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                        'Access-Control-Allow-Methods': 'GET',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Credentials': true
                    });
                    res.end(JSON.stringify(servers));
                    break;
            }
            break;

        case "createserver":
            switch (req.method) {
                case "OPTIONS":
                    res.writeHead(204, {
                        'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                        'Access-Control-Allow-Methods': 'POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Credentials': true
                    });
                    res.end();
                    break;
                case "POST":
                    let csBody = '';
                    req.on('data', chunk => { csBody += chunk.toString(); });
                    req.on('end', async () => {
                        try {
                            const user = await getUserFromRequest(req);
                            if (!user) {
                                sendBadResponse(req, res, 401, "You must be logged in to create a server.");
                                return;
                            }

                            if (global.ephemeralServers.has(parseInt(user.userid))) {
                                const existingId = global.ephemeralServers.get(parseInt(user.userid));
                                if (Servers[existingId]) {
                                    sendBadResponse(req, res, 400, "You already have a custom server. Delete it first.");
                                    return;
                                }
                                global.ephemeralServers.delete(parseInt(user.userid));
                            }

                            let json = {};
                            try { json = JSON.parse(csBody); } catch (e) {}

                            const serverName = (json.name || `${user.username}'s Server`).substring(0, 30);
                            const maxPlayers = Math.min(Math.max(parseInt(json.maxPlayers) || 10, 1), 100);
                            const foodValue = Math.min(Math.max(parseFloat(json.foodValue) || 10, 1), 100);
                            const defaultLength = Math.min(Math.max(parseInt(json.defaultLength) || 10, 1), 200);
                            const arenaSize = Math.min(Math.max(parseInt(json.arenaSize) || 300, 50), 2000);

                            // Find a free ID starting at nextEphemeralId
                            while (Servers[nextEphemeralId]) nextEphemeralId++;
                            const newId = nextEphemeralId++;

                            const { SnakeFunctions: SF } = require("./modules/EntityFunctions.js");
                            const serverInfo = {
                                id: newId,
                                name: serverName,
                                maxplayers: maxPlayers,
                                owner: user.userid,
                                type: "custom",
                                isEphemeral: true,
                                pinned: false,
                                config: {
                                    ...defaultConfig,
                                    FoodValue: SF.ScoreToLength(foodValue),
                                    DefaultLength: defaultLength,
                                    ArenaSize: arenaSize,
                                }
                            };

                            Servers[newId] = new Server(serverInfo);
                            global.ephemeralServers.set(parseInt(user.userid), newId);
                            console.log(`Created ephemeral server ${newId} for user ${user.userid} (${user.username})`);

                            res.writeHead(200, {
                                'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                                'Access-Control-Allow-Headers': 'Content-Type',
                                'Access-Control-Allow-Credentials': true
                            });
                            res.end(JSON.stringify({ success: true, serverId: newId }));
                        } catch (err) {
                            console.error("createserver error:", err);
                            sendBadResponse(req, res, 500, "Internal server error.");
                        }
                    });
                    break;
                default:
                    sendBadResponse(req, res, 405, "Method not allowed");
                    break;
            }
            break;

        case "deleteserver":
            switch (req.method) {
                case "OPTIONS":
                    res.writeHead(204, {
                        'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                        'Access-Control-Allow-Methods': 'POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Credentials': true
                    });
                    res.end();
                    break;
                case "POST":
                    req.on('data', () => {});
                    req.on('end', async () => {
                        try {
                            const user = await getUserFromRequest(req);
                            if (!user) {
                                sendBadResponse(req, res, 401, "You must be logged in.");
                                return;
                            }
                            const serverId = global.ephemeralServers.get(parseInt(user.userid));
                            if (!serverId || !Servers[serverId]) {
                                sendBadResponse(req, res, 404, "You don't have a custom server.");
                                return;
                            }
                            Servers[serverId].destroy();
                            res.writeHead(200, {
                                'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                                'Access-Control-Allow-Headers': 'Content-Type',
                                'Access-Control-Allow-Credentials': true
                            });
                            res.end(JSON.stringify({ success: true }));
                        } catch (err) {
                            console.error("deleteserver error:", err);
                            sendBadResponse(req, res, 500, "Internal server error.");
                        }
                    });
                    break;
                default:
                    sendBadResponse(req, res, 405, "Method not allowed");
                    break;
            }
            break;

        case "myserver":
            switch (req.method) {
                case "OPTIONS":
                    res.writeHead(204, {
                        'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                        'Access-Control-Allow-Methods': 'GET, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Credentials': true
                    });
                    res.end();
                    break;
                case "GET":
                    try {
                        const user = await getUserFromRequest(req);
                        if (!user) {
                            sendBadResponse(req, res, 401, "You must be logged in.");
                            return;
                        }
                        const serverId = global.ephemeralServers.get(parseInt(user.userid));
                        if (!serverId || !Servers[serverId]) {
                            res.writeHead(200, {
                                'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                                'Access-Control-Allow-Headers': 'Content-Type',
                                'Access-Control-Allow-Credentials': true
                            });
                            res.end(JSON.stringify({ success: true, server: null }));
                            return;
                        }
                        const server = Servers[serverId];
                        const timeLeftMs = Math.max(0, EPHEMERAL_TIMEOUT_MS - (Date.now() - server.lastConnectionTime));
                        const thisConfig = JSON.parse(JSON.stringify(server.config));
                        thisConfig.FoodValue = SnakeFunctions.LengthToScore(thisConfig.FoodValue);
                        res.writeHead(200, {
                            'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                            'Access-Control-Allow-Methods': 'GET, OPTIONS',
                            'Access-Control-Allow-Headers': 'Content-Type',
                            'Access-Control-Allow-Credentials': true
                        });
                        res.end(JSON.stringify({
                            success: true,
                            server: {
                                id: server.id,
                                name: server.name,
                                maxplayers: server.MaxPlayers,
                                playerCount: Object.keys(server.snakes).length,
                                admins: server.admins,
                                timeLeftMs: timeLeftMs,
                                config: JSON.stringify(thisConfig, true, 4)
                            }
                        }));
                    } catch (err) {
                        console.error("myserver error:", err);
                        sendBadResponse(req, res, 500, "Internal server error.");
                    }
                    break;
                default:
                    sendBadResponse(req, res, 405, "Method not allowed");
                    break;
            }
            break;

        case "addadmin":
            switch (req.method) {
                case "OPTIONS":
                    res.writeHead(204, {
                        'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                        'Access-Control-Allow-Methods': 'POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Credentials': true
                    });
                    res.end();
                    break;
                case "POST":
                    let aaBody = '';
                    req.on('data', chunk => { aaBody += chunk.toString(); });
                    req.on('end', async () => {
                        try {
                            const user = await getUserFromRequest(req);
                            if (!user) { sendBadResponse(req, res, 401, "You must be logged in."); return; }
                            const serverId = global.ephemeralServers.get(parseInt(user.userid));
                            if (!serverId || !Servers[serverId]) { sendBadResponse(req, res, 404, "You don't have a custom server."); return; }
                            let json = {};
                            try { json = JSON.parse(aaBody); } catch(e) {}
                            const adminId = parseInt(json.userId);
                            if (isNaN(adminId)) { sendBadResponse(req, res, 400, "Invalid user id."); return; }
                            const added = Servers[serverId].addAdmin(adminId);
                            res.writeHead(200, {
                                'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                                'Access-Control-Allow-Headers': 'Content-Type',
                                'Access-Control-Allow-Credentials': true
                            });
                            res.end(JSON.stringify({ success: true, added }));
                        } catch (err) {
                            sendBadResponse(req, res, 500, "Internal server error.");
                        }
                    });
                    break;
                default:
                    sendBadResponse(req, res, 405, "Method not allowed");
                    break;
            }
            break;

        case "removeadmin":
            switch (req.method) {
                case "OPTIONS":
                    res.writeHead(204, {
                        'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                        'Access-Control-Allow-Methods': 'POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Credentials': true
                    });
                    res.end();
                    break;
                case "POST":
                    let raBody = '';
                    req.on('data', chunk => { raBody += chunk.toString(); });
                    req.on('end', async () => {
                        try {
                            const user = await getUserFromRequest(req);
                            if (!user) { sendBadResponse(req, res, 401, "You must be logged in."); return; }
                            const serverId = global.ephemeralServers.get(parseInt(user.userid));
                            if (!serverId || !Servers[serverId]) { sendBadResponse(req, res, 404, "You don't have a custom server."); return; }
                            let json = {};
                            try { json = JSON.parse(raBody); } catch(e) {}
                            const adminId = parseInt(json.userId);
                            if (isNaN(adminId)) { sendBadResponse(req, res, 400, "Invalid user id."); return; }
                            const removed = Servers[serverId].removeAdmin(adminId);
                            res.writeHead(200, {
                                'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                                'Access-Control-Allow-Headers': 'Content-Type',
                                'Access-Control-Allow-Credentials': true
                            });
                            res.end(JSON.stringify({ success: true, removed }));
                        } catch (err) {
                            sendBadResponse(req, res, 500, "Internal server error.");
                        }
                    });
                    break;
                default:
                    sendBadResponse(req, res, 405, "Method not allowed");
                    break;
            }
            break;

        default:
            console.log("404: ", req.url);
            sendBadResponse(req, res, 404, "Endpoint not found");
            break;
    }
}

let httpServer = HttpServer(serverListener).listen(1335, "127.0.0.1");
const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (ws, req) => {
    try {
        const parsed = url.parse(req.url, true);

        if (parsed.pathname !== "/ws") {
            ws.close(1008, "Invalid websocket path");
            return;
        }

        const serverId = parsed.query.server;
        if (!serverId) {
            ws.close(1008, "Missing server id");
            return;
        }

        const targetServer = Servers[serverId];
        if (!targetServer) {
            ws.close(1008, "Invalid server id");
            return;
        }
        targetServer.attachWebSocket(ws, req);
    } catch (err) {
        console.error("WebSocket routing error:", err);
        try {
            ws.close(1011, "Internal server error");
        } catch {}
    }
});

var obj;

Servers = [];

/*DBFunctions.GetServers().then(async (servers) => {
    servers.forEach(server => {
        Servers[server.id] = new Server(server);

        if (server.id == 1341) {
            for (let i = 0; i < 30; i++) {
                let bot = new Bot(Servers[server.id])
            }
        }
    })
    console.log("DB servers loaded")
}).catch(err => {
    console.error("Error fetching DB servers: ", err);
})*/

fs.readFile('./servers.json', 'utf8', function (err, data) {
    if (err) return console.error("Error reading servers.json: ", err);
    let servers = JSON.parse(data);
    servers.forEach(server => {
        Servers[server.id] = new Server(server);
    });
    console.log("servers.json loaded");
});