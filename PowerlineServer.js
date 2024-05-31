const { SnakeFunctions } = require("./modules/EntityFunctions.js");
const Server = require("./modules/Server.js");
const fs = require("fs");
const DatabaseFunctions = require("./modules/DatabaseFunctions.js");

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
    "DefaultLength": 10
}

UPDATE_EVERY_N_TICKS = 3;
SCORE_MULTIPLIER = 10/defaultConfig.FoodValue


console.log(SnakeFunctions.ScoreToLength(10))


const HttpsServer = require('https').createServer;
const HttpServer = require('http').createServer;

function serverListener(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': 2592000
        });
        res.end();
        return;
    }

    if (req.method === 'POST') {
        console.log("Endpoint: " + req.url.split("/")[1])
        switch (req.url.split("/")[1]) {
            case "createserver":
                let body = '';
                req.on('data', chunk => {
                    body += chunk.toString();
                });
                req.on('end', async () => {
                    let cookies = req.headers.cookie ? req.headers.cookie.split("; ") : [];
                    /*let sessionCookie = cookies.find(cookie => cookie.includes("session_id="));
                    if (!sessionCookie) {
                        res.writeHead(401, {
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Methods': 'POST, OPTIONS',
                            'Access-Control-Allow-Headers': 'Content-Type'
                        });
                        let jsonRes = {
                            success: false,
                            error: "Unauthorized",
                            message: "No session cookie"
                        }
                        res.end(JSON.stringify(jsonRes));
                        return;
                    }
                    let sessionId = sessionCookie.split("=")[1];*/
                    let sessionId = `p7lqxEHUGwxQrJlZAxs3ZaqmEpZ3Y6`

                    try {
                        let user = await DBFunctions.GetUserFromSession(sessionId);
                        let userID = user.userid;
                        if (!userID) {
                            res.writeHead(401, {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                                'Access-Control-Allow-Headers': 'Content-Type'
                            });
                            let jsonRes = {
                                success: false,
                                error: "Unauthorized",
                                message: "Invalid session"
                            }
                            res.end(JSON.stringify(jsonRes));
                            return;
                        }

                        let json = JSON.parse(body);

                        if (!json.name || json.name.length > 20 || json.name.length < 3) {
                            res.writeHead(400, {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                                'Access-Control-Allow-Headers': 'Content-Type'
                            });
                            let jsonRes = {
                                success: false,
                                error: "Invalid server name",
                                message: "Server name must be between 3 and 20 characters"
                            }
                            res.end(JSON.stringify(jsonRes));
                            return;
                        }
                        if (json.maxPlayers < 1 || json.maxPlayers > 100) {
                            res.writeHead(400, {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                                'Access-Control-Allow-Headers': 'Content-Type'
                            });
                            let jsonRes = {
                                success: false,
                                error: "Invalid max players",
                                message: "Max players must be between 1 and 100"
                            }
                            res.end(JSON.stringify(jsonRes));
                            return;
                        }
                        if (json.foodValue < 1 || json.foodValue > 100) {
                            res.writeHead(400, {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                                'Access-Control-Allow-Headers': 'Content-Type'
                            });
                            let jsonRes = {
                                success: false,
                                error: "Invalid food value",
                                message: "Food value must be between 1 and 100"
                            }
                            res.end(JSON.stringify(jsonRes));
                            return;
                        }
                        if (json.isPublic !== true && json.isPublic !== false) {
                            res.writeHead(400, {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                                'Access-Control-Allow-Headers': 'Content-Type'
                            });
                            let jsonRes = {
                                success: false,
                                error: "Invalid isPublic",
                                message: "isPublic must be a boolean"
                            }
                            res.end(JSON.stringify(jsonRes));
                            return;
                        }
                        if (json.defaultLength < 1 || json.defaultLength > 1000) {
                            res.writeHead(400, {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                                'Access-Control-Allow-Headers': 'Content-Type'
                            });
                            let jsonRes = {
                                success: false,
                                error: "Invalid default length",
                                message: "Default length must be between 1 and 1000"
                            }
                            res.end(JSON.stringify(jsonRes));
                            return;
                        }
                        if (json.arenaSize < 1 || json.arenaSize > 1000) {
                            res.writeHead(400, {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                                'Access-Control-Allow-Headers': 'Content-Type'
                            });
                            let jsonRes = {
                                success: false,
                                error: "Invalid arena size",
                                message: "Arena size must be between 1 and 1000"
                            }
                            res.end(JSON.stringify(jsonRes));
                            return;
                        }
                        
                        let alreadyServer = false;
                        Object.values(Servers).forEach(server => {
                            if (alreadyServer)
                                return
                            if (parseInt(server.owner) == parseInt(userID)) {
                                res.writeHead(400, {
                                    'Access-Control-Allow-Origin': '*',
                                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                                    'Access-Control-Allow-Headers': 'Content-Type'
                                });
                                let jsonRes = {
                                    success: false,
                                    error: "Too many servers",
                                    message: "You already have a server"
                                }
                                res.end(JSON.stringify(jsonRes));
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
                            ownerName: user.username,
                            MaxPlayers: json.maxPlayers,
                            config: serverConfig
                        });
                        res.writeHead(200, {
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Methods': 'POST, OPTIONS',
                            'Access-Control-Allow-Headers': 'Content-Type',
                        });
                        res.end(JSON.stringify({
                            success: true,
                            serverId: newServerId
                        }));

                        let serversFile = fs.readFileSync('./webserver/servers.json');
                        let servers = JSON.parse(serversFile);
                        servers.servers.push({
                            id: newServerId,
                            name: json.name,
                            maxPlayers: parseInt(json.maxPlayers),
                            owner: userID,
                            ownerName: user.username,
                            isPublic: json.isPublic,
                            config: serverConfig
                        });
                        fs.writeFileSync('./webserver/servers.json', JSON.stringify(servers, null, 4));

                    } catch (error) {
                        res.writeHead(500, {
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Methods': 'POST, OPTIONS',
                            'Access-Control-Allow-Headers': 'Content-Type'
                        });
                        res.end(JSON.stringify({
                            success: false,
                            error: "Internal Server Error",
                            message: error.message
                        }));
                    }
                });
                break;

            default:
                res.writeHead(404, {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                });
                res.end(JSON.stringify({
                    success: false,
                    error: "Not Found",
                    message: "Endpoint not found"
                }));
                break;
        }
    } else {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end('All glory to WebSockets!\n');
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
fs.readFile('./webserver/servers.json', 'utf8', function (err, data) {
  if (err) throw err;
    let servers = JSON.parse(data);
    servers.servers.forEach(server => {
        Servers[server.id] = new Server(server);
    })
});