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
    }
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