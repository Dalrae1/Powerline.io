require('dotenv').config();
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

let remoteServers = []

async function serverListener(req, res) {
    let directory = req.url.split("/")[1];
    if (directory.includes("?"))
        directory = directory.split("?")[0];
    switch (directory) {
        case "heartbeat": // Remote servers will send a heartbeat to the master server
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
                        //Check for duplicates
                        let host = req.connection.remoteAddress.split(":")[3]
                        let containsDuplicate = remoteServers.find(server => server.host == `${host}:${json.port}`);
                        if (!containsDuplicate) {
                            remoteServers.push({
                                name: json.name,
                                host: `${host}:${json.port}`,
                                type: "remote"
                            })
                        }
                    })
            }
            break
        /*case "createserver":
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
                            sendBadResponse(req, res, 401, "You are not logged in");
                            return;
                        }
                        let sessionId = sessionCookie.split("=")[1];
    
                        try {
                            let user = await DBFunctions.GetUserFromSession(sessionId);
                            let userID = user.userid;
                            if (!userID) {
                                sendBadResponse(req, res, 401, "Invalid session. Please try to relog in");
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
        case "editserver":
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
                            sendBadResponse(req, res, 401, "You are not logged in");
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

                            if (!json.serverId) {
                                sendBadResponse(req, res, 400, "No server id provided");
                                return;
                            }

                            if (!Servers[json.serverId]) {
                                sendBadResponse(req, res, 400, "Server id provided is invalid");
                                return;
                            }

                            if (Servers[json.serverId].owner != userID && user.rank < 3) {
                                sendBadResponse(req, res, 401, "You do not own this server");
                                return;
                            }

                            if (json.name && (json.name.length > 20 || json.name.length < 3)) {
                                sendBadResponse(req, res, 400, "Server name must be between 3 and 20 characters");
                                return;
                            }
                            if (json.maxPlayers && (json.maxPlayers < 1 || json.maxPlayers > 100)) {
                                sendBadResponse(req, res, 400, "Max players must be between 1 and 100");
                                return;
                            }
                            if (json.foodValue && (json.foodValue < 1 || json.foodValue > 100)) {
                                sendBadResponse(req, res, 400, "Food value must be between 1 and 100");
                                return;
                            }
                            if (json.isPublic && (json.isPublic !== true && json.isPublic !== false)) {
                                sendBadResponse(req, res, 400, "isPublic must be a boolean");
                                return;
                            }
                            if (json.defaultLength && (json.defaultLength < 1 || json.defaultLength > 1000)) {
                                sendBadResponse(req, res, 400, "Default length must be between 1 and 1000");
                                return;
                            }
                            if (json.arenaSize && (json.arenaSize < 1 || json.arenaSize > 1000)) {
                                sendBadResponse(req, res, 400, "Arena size must be between 1 and 1000");
                                return;
                            }
                            Servers[json.serverId].Stop()

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


                            Servers[json.serverId] = new Server({
                                id: json.serverId,
                                name: json.name,
                                owner: userID,
                                maxplayers: json.maxPlayers,
                                config: serverConfig
                            });

                            DBFunctions.UpdateServer({
                                id: json.serverId,
                                name: json.name,
                                owner: userID,
                                maxplayers: json.maxPlayers,
                                config: JSON.stringify(serverConfig)
                            })

                            res.writeHead(200, {
                                'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                                'Access-Control-Allow-Headers': 'Content-Type',
                                'Access-Control-Allow-Credentials': true
                            });
                            res.end(JSON.stringify({
                                success: true
                            }));



                        } catch (error) {
                            sendBadResponse(req, res, 500, "Internal Server Error: " + error.message);
                        }
                    })


                    break
                }
            break */
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
                        let thisConfig = JSON.parse(JSON.stringify(server.config))
                        thisConfig.FoodValue = SnakeFunctions.LengthToScore(thisConfig.FoodValue)
                        return {
                            id: server.id,
                            name: server.name,
                            owner: server.owner,
                            maxplayers: server.MaxPlayers,
                            pinned: server.pinned,
                            playerCount: Object.keys(server.snakes).length,
                            config: JSON.stringify(thisConfig, true, 4)
                        }
                    })
                    servers = servers.concat(remoteServers)
                    res.writeHead(200, {
                        'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
                        'Access-Control-Allow-Methods': 'GET',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Access-Control-Allow-Credentials': true
                    });
                    res.end(JSON.stringify(servers, true, 4));
                    break
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
        /* case "fetchserverinfo":
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
            break */
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
        case "fetchservers": // Retrieve a list of user-created servers
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
        default:
            console.log("404: ", req.url);
                sendBadResponse(req, res, 404, "Endpoint not found");
                break;
    }
}


let httpsServer
let httpServer = HttpServer(serverListener).listen(1335)


if (fs.existsSync(process.env.CERT_PUBLIC_PATH)) {
    let cert = fs.realpathSync(process.env.CERT_PUBLIC_PATH)
    let key = fs.realpathSync(process.env.CERT_PRIVATE_PATH)
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
    })
    console.log("servers.json loaded");
});