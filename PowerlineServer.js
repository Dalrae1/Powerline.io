const { SnakeFunctions } = require("./modules/EntityFunctions.js");
const Server = require("./modules/Server.js");
const fs = require("fs");
const DatabaseFunctions = require("./modules/DatabaseFunctions.js");
const Bot = require("./modules/Bot.js");

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
SCORE_MULTIPLIER = 10/defaultConfig.FoodValue


const HttpsServer = require('https').createServer;
const HttpServer = require('http').createServer;

function sendBadResponse(req, res, code, message) {
    res.writeHead(code, {
        'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': true
    });
    res.end(JSON.stringify({
        success: false,
        message: message
    }));


}

async function serverListener(req, res) {
    let directory = req.url.split("/")[1];
    if (directory.includes("?"))
        directory = directory.split("?")[0];
    switch (directory) {
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
                    let body = '';
                    req.on('data', chunk => {
                        body += chunk.toString();
                    });
                    req.on('end', async () => {
                        let cookies = req.headers.cookie ? req.headers.cookie.split("; ") : [];
                        let sessionCookie = cookies.find(cookie => cookie.includes("session_id="));
                        if (!sessionCookie) {
                            sendBadResponse(req, res, 401, "No session cookie");
                            return;
                        }
                        let sessionId = sessionCookie.split("=")[1];
    
                        try {
                            let user = await DBFunctions.GetUserFromSession(sessionId);
                            let userID = user.userid;
                            if (!userID) {
                                sendBadResponse(req, res, 401, "Invalid session");
                                return;
                            }
    
                            let json = JSON.parse(body);
    
                            if (!json.name || json.name.length > 20 || json.name.length < 3) {
                                sendBadResponse(req, res, 400, "Server name must be between 3 and 20 characters");
                                return;
                            }
                            if (json.maxPlayers < 1 || json.maxPlayers > 100) {
                                sendBadResponse(req, res, 400, "Max players must be between 1 and 100");
                                return;
                            }
                            if (json.foodValue < 1 || json.foodValue > 100) {
                                sendBadResponse(req, res, 400, "Food value must be between 1 and 100");
                                return;
                            }
                            if (json.isPublic !== true && json.isPublic !== false) {
                                sendBadResponse(req, res, 400, "isPublic must be a boolean");
                                return;
                            }
                            if (json.defaultLength < 1 || json.defaultLength > 1000) {
                                sendBadResponse(req, res, 400, "Default length must be between 1 and 1000");
                                return;
                            }
                            if (json.arenaSize < 1 || json.arenaSize > 1000) {
                                sendBadResponse(req, res, 400, "Arena size must be between 1 and 1000");
                                return;
                            }
                            
                            let alreadyServer = false;
                            Object.values(Servers).forEach(server => {
                                if (alreadyServer)
                                    return
                                if (parseInt(server.owner) == parseInt(userID)) {
                                    sendBadResponse(req, res, 400, "You already have the maximum amount of servers");
                                    alreadyServer = true;
                                }
                            })
                            if (alreadyServer) {
                                return;
                                
                            }
    
    
                            let newServerId = 1337 + (Object.values(Servers).length * 2);
                            let serverConfig = {
                                "ConfigType": 160,
                                "ArenaSize": parseInt(json.arenaSize),
                                "DefaultZoom": 2,
                                "MinimumZoom": 1.5,
                                "MinimumZoomScore": 100,
                                "ZoomLevel2": 10,
                                "GlobalWebLag": 90,
                                "GlobalMobileLag": 60,
                                "OtherSnakeDelay": 40,
                                "IsTalkEnabled": 1,
                                "FoodValue": SnakeFunctions.ScoreToLength(json.foodValue),
                                "UpdateInterval": 100,
                                "MaxBoostSpeed": 255,
                                "MaxRubSpeed": 200,
                                "DefaultLength": parseInt(json.defaultLength),
                            }
                            Servers[newServerId] = new Server({
                                id: newServerId,
                                name: json.name,
                                owner: userID,
                                maxplayers: json.maxPlayers,
                                config: serverConfig
                            });
                            res.writeHead(200, {
                                'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                                'Access-Control-Allow-Headers': 'Content-Type',
                                'Access-Control-Allow-Credentials': true
                            });
                            res.end(JSON.stringify({
                                success: true,
                                serverId: newServerId
                            }));

                            DBFunctions.CreateServer({
                                id: newServerId,
                                name: json.name,
                                owner: userID,
                                maxplayers: json.maxPlayers,
                                config: JSON.stringify(serverConfig)
                            })
    
                        } catch (error) {
                            sendBadResponse(req, res, 500, "Internal Server Error: " + error.message);
                        }
                    });
                    break
                default:
                    res.writeHead(200, {
                        'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                        'Access-Control-Allow-Methods': 'POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Credentials': true
                    });
                    res.end(`Cannot ${req.method} /${req.url.split("/")[1]}`);
                    break
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
                    let servers = await DBFunctions.GetServers();
                    res.writeHead(200, {
                        'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                        'Access-Control-Allow-Methods': 'GET',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Credentials': true
                    });
                    servers.forEach(server => {
                        if (Servers[server.id])
                            server.playerCount = Object.keys(Servers[server.id].snakes).length;
                    })
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
                    break
            }
            break
        case "fetchserverinfo":
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
                    let queryStrings = req.url.split("?")[1]
                    if (!queryStrings) {
                        sendBadResponse(req, res, 400, "No server id provided");
                        return;
                    }
                    if (queryStrings.split("&").length == 0) {
                        sendBadResponse(req, res, 400, "No server id provided");
                        return;

                    }
                    let serverIds = req.url.split("?")[1].split("&").map((id) => id.split("=")[1]);
                    if (serverIds.length == 0) {
                        sendBadResponse(req, res, 400, "Server ids provided are invalid");
                        return;
                    }
                    var serverInfo = {}
                    serverIds.forEach((id) => {
                        if (!Servers[id])
                            return
                        serverInfo[id] = {
                            id: id,
                            playerCount: Object.keys(Servers[id].snakes).length,
                        }
                    })
                    res.writeHead(200, {
                        'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                        'Access-Control-Allow-Methods': 'GET',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Credentials': true
                    });
                    res.end(JSON.stringify(serverInfo));

            }
            break
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
                    let queryStrings = req.url.split("?")[1]
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
                    break
            }
            break
        default:
                sendBadResponse(req, res, 404, "Endpoint not found");
                break;
    }
}


let httpsServer
let httpServer = HttpServer(serverListener).listen(1335)


if (fs.existsSync("C:\\Certbot\\live\\dalr.ae\\cert.pem")) {
    let cert = fs.realpathSync("C:\\Certbot\\live\\dalr.ae\\cert.pem")
    let key = fs.realpathSync("C:\\Certbot\\live\\dalr.ae\\privkey.pem")
    let chain = fs.realpathSync("C:\\Certbot\\live\\dalr.ae\\fullchain.pem")
    httpsServer = HttpsServer({
        cert: fs.readFileSync(cert),
        key: fs.readFileSync(key)
    }, serverListener)
    httpsServer.listen(1336);
}


var obj;

Servers = []

/*DBFunctions.CreateServer({
    id: 1339,
    name: "Modded Server",
    owner: 1,
    maxplayers: 10,
    config: JSON.stringify({
        "ConfigType": 160,
        "ArenaSize": 400,
        "DefaultZoom": 2,
        "MinimumZoom": 1.5,
        "MinimumZoomScore": 100,
        "ZoomLevel2": 10,
        "GlobalWebLag": 90,
        "GlobalMobileLag": 60,
        "OtherSnakeDelay": 40,
        "IsTalkEnabled": 1,
        "FoodValue": SnakeFunctions.ScoreToLength(20),
        "UpdateInterval": 100,
        "MaxBoostSpeed": 255,
        "MaxRubSpeed": 200,
        "DefaultLength": 10,
    })
})*/

DBFunctions.GetServers().then(async (servers) => {
    servers.forEach(server => {
        server.config = JSON.parse(server.config);
        Servers[server.id] = new Server(server);

        if (server.id == 1337) {
            for (let i = 0; i < 30; i++) {
                let bot = new Bot(Servers[server.id])
            }
        }
    })
    console.log("Servers loaded")
}).catch(err => {
    console.error("Error fetching servers: ", err);
})
/*fs.readFile('./webserver/servers.json', 'utf8', function (err, data) {
  if (err) throw err;
    let servers = JSON.parse(data);
    servers.servers.forEach(server => {
        Servers[server.id] = new Server(server);
    })
});*/