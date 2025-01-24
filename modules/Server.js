const WebSocket = require('ws');
const HttpsServer = require('https').createServer;
const HttpServer = require('http').createServer;
const http = require('http');
const fs = require("fs");


const IDManager = require("./IDManager.js");
const Enums = require("./Enums.js");
const Food = require("./Food.js");
const Snake = require("./Snake.js");
const MapFunctions = require("./MapFunctions.js");
const { EntityFunctions, SnakeFunctions } = require("./EntityFunctions.js");
const Quadtree = require("./Quadtree.js");
const Client = require("./Client.js");
const DatabaseFunctions = require("./DatabaseFunctions.js");
const AVLTree = require("./AVLTree.js");
const GlobalFunctions = require("./GlobalFunctions.js")
const Bot = require("./Bot.js");

let DBFunctions = new DatabaseFunctions();


function getSegmentLength(point1, point2) {
    return Math.abs(Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)));
}

class Server {
    constructor(serverInfo) {
        this.id = serverInfo.id;
        this.name = serverInfo.name;
        this.MaxPlayers = serverInfo.maxplayers;
        this.pinned = serverInfo.pinned;
        this.config = serverInfo.config || {};
        this.config.MaxRubAcceleration = 4;
        this.config.MaxMessagesPerSecond = 30;
        this.owner = serverInfo.owner;
        this.type = serverInfo.type;
        this.host = serverInfo.host;

        this.entityIDs = new IDManager();
        this.clientIDs = new IDManager();
        this.leaderboard = new AVLTree();
        this.entityQuadtree = new Quadtree({
            x: -this.config.ArenaSize / 2,
            y: -this.config.ArenaSize / 2,
            width: this.config.ArenaSize,
            height: this.config.ArenaSize
        }, 10)
        this.stopped = false
        this.barriers = [];
        this.chatHistory = [];

       

        this.leaderboardDataview = null
        this.leaderboardDataviewOffset = 0
        
        this.foodMultiplier = 1;
        this.maxFood = 60000;
        this.naturalFood = 0;
        this.maxNaturalFood = this.config.ArenaSize * 5
        this.foodSpawnPercent = (this.config.ArenaSize ^ 2) / 10;
        this.artificialPing = 0;



        this.king = null;
        this.lastUpdate = 0;
        this.admins = [
            parseInt(this.owner)
        ];
        this.debugGrabAmount = 1000;
        this.entities = [];
        this.clients = [];
        this.snakes = [];

        this.httpServer = HttpServer(this.serverListener).listen(this.id)

        this.unsecureServer = new WebSocket.Server({ server: this.httpServer });


        if (fs.existsSync(process.env.CERT_PUBLIC_PATH)) {
            let cert = fs.realpathSync(process.env.CERT_PUBLIC_PATH)
            let key = fs.realpathSync(process.env.CERT_PRIVATE_PATH)
            this.httpsServer = HttpsServer({
                cert: fs.readFileSync(cert),
                key: fs.readFileSync(key)
            }, this.serverListener)
            this.secureServer = new WebSocket.Server({ server: this.httpsServer });
            this.httpsServer.listen(parseInt(this.id)+1);
        }
        
        if (this.secureServer) {
            this.secureServer.on('connection', this.websocketListener);
        }

        this.unsecureServer.on('connection', this.websocketListener);

        if (this.config.Barriers) {
            if (this.config.Barriers == "random") {
                for (let i = 0; i < 20; i++) {
                    let isTall = Math.random() > 0.5;
                    let width, height;
                    if (isTall) {
                        width = Math.random() * 100 + 5;
                        height = Math.random() * 10 + 5;
                    } else {
                        width = Math.random() * 10 + 5;
                        height = Math.random() * 100 + 5;
                    }
        
                    // Generate random position ensuring the barrier stays within bounds
                    let halfWidth = this.config.ArenaSize / 2;
                    let randomX = Math.random() * (this.config.ArenaSize - width) - halfWidth + width / 2;
                    let randomY = Math.random() * (this.config.ArenaSize - height) - halfWidth + height / 2;
        
                    this.barriers.push({
                        x: randomX,
                        y: randomY,
                        width: width,
                        height: height,
                    });
                }
            } else {
                this.config.Barriers.forEach((barrier) => {
                    this.barriers.push({
                        x: barrier.x,
                        y: barrier.y,
                        width: barrier.width,
                        height: barrier.height
                    })
                })
            }
        }

        if (this.config.Bots) {
            for (let i = 0; i < this.config.Bots; i++) {
                let bot = new Bot(this)
            }
        }


        for (let i = 0; i < this.maxNaturalFood; i++) {
            new Food(this);
        }
        if (this.type == "remote") {
            setInterval(() => {
                // Send POST request to master server
                let data = {
                    name: this.name,
                    port: this.id,
                    players: Object.keys(this.clients).length,
                    maxPlayers: this.MaxPlayers
                }
                let options = {
                    hostname: "dalr.ae",
                    method: 'POST',
                    path: '/heartbeat',
                    port: 1335,
                }
                let req = http.request(options, (res) => {
                    res.on('data', (d) => {
                        console.log(d.toString())
                    })
                })
                req.write(JSON.stringify(data))
                req.end()

            }, 1000)
        }

        this.start()
        return this;
    }

    serverListener = (req, res) => {
        res.writeHead(404, {
            'Access-Control-Allow-Origin': req.headers.origin || req.headers.host || "null",
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Credentials': true
        });
        res.end(`This directory is not meant to be accessed directly. Please visit ${req.headers.host} to play!`);
    }
    websocketListener = (ws, req) => {
        let cookies = req.headers.cookie;
        let session;
    
        if (cookies) {
            let sessionCookie = cookies.split(";").find((cookie) => cookie.includes("session_id="));
            if (sessionCookie) {
                session = sessionCookie.split("=")[1];
            }
        }
        let queuedMessages = [];
        function incomingQueue(message, req) {
            queuedMessages.push(message);
        }
        ws.on('message', incomingQueue)
        if (session) {
            DBFunctions.GetUserFromSession(session).then((user) => {
                let client = null
                if (user) {
                    client = new Client(this, ws, user);
                }
                else {
                    client = new Client(this, ws);
                }
                queuedMessages.forEach((message) => {
                    let view = new DataView(new Uint8Array(message).buffer);
                    let messageType = view.getUint8(0);
                    client.RecieveMessage(messageType, view)
                })
                ws.off('message', incomingQueue)
                ws.on('message', async function incoming(message, req) {
                    let view = new DataView(new Uint8Array(message).buffer);
                    let messageType = view.getUint8(0);
                    client.RecieveMessage(messageType, view)
                })
                ws.on('close', () => {
                    if (client.snake && client.snake.id) {
                        client.snake.kill(Enums.KillReasons.LEFT_SCREEN, client.snake);
                    }
                    this.clientIDs.releaseID(client.id)
                    delete this.clients[client.id];
                })
    
            }).catch((err) => {
                console.error("Error: "+err)
            })
        }
        else {
            let client = new Client(this, ws, null);
            ws.on('message', async function incoming(message, req) {
                let view = new DataView(new Uint8Array(message).buffer);
                let messageType = view.getUint8(0);
                client.RecieveMessage(messageType, view)
            })
            ws.on('close', () => {
                if (client.snake && client.snake.id) {
                    client.snake.kill(Enums.KillReasons.LEFT_SCREEN, client.snake);
                }
                this.clientIDs.releaseID(client.id)
                delete this.clients[client.id];
            })
        }
    }

    Stop() {
        this.unsecureServer.clients.forEach((client) => {
            client.close(1000, "Server shutting down")
        })
        this.unsecureServer.close()
        this.httpServer.close()
        if (this.secureServer) {
            this.secureServer.close()
            this.httpsServer.close()
        }
    }

    RefreshLeaderboard() {
        let count = 0

        let offset = 0
        this.leaderboardDataview = new DataView(new ArrayBuffer(1000))
        this.leaderboardDataview.setUint8(offset, Enums.ServerToClient.OPCODE_LEADERBOARD)
        offset+=1
        for (let pair of this.leaderboard.reverseOrderTraversal()) {
            let snake = this.entities[pair.data]
            if (!snake || !snake.spawned)
                continue
            count++
            snake.leaderboardPosition = count
            if (count == 1)
                this.king = snake
            if (count > 10)
                continue
            this.leaderboardDataview.setUint16(offset, snake.id, true);
            offset += 2;
            this.leaderboardDataview.setUint32(offset, (snake.actualLength - this.config.DefaultLength) * SCORE_MULTIPLIER, true);
            offset += 4;
            this.leaderboardDataview, offset = GlobalFunctions.SetNick(this.leaderboardDataview, offset, snake.nick)
            this.leaderboardDataview.setUint16(offset, 0, true);
        }
        this.leaderboardDataview.setUint16(offset, 0x0, true);
        offset += 2;
        this.leaderboardDataviewOffset = offset
    }

    UpdateArena() {
        let numSnak = 0;
        let numPoints = 0;
        //let tickMultiplier = (Date.now()-this.lastUpdate)/this.config.UpdateInterval;
        let tickMultiplier = 1//((Date.now()-this.lastUpdate)/this.config.UpdateInterval)
        //console.log(`Last update was ${(Date.now()-this.lastUpdate)}ms ago, tick multiplier is ${tickMultiplier}`)
        Object.values(this.snakes).forEach((snake) => {
            numSnak++
            // Make snakes move
            let totalSpeed = snake.speed //+ (snake.extraSpeed/255);
            if (snake.direction == Enums.Directions.UP) {
                snake.position.y += (totalSpeed * UPDATE_EVERY_N_TICKS)*tickMultiplier;
            } else if (snake.direction == Enums.Directions.LEFT) {
                snake.position.x -= (totalSpeed * UPDATE_EVERY_N_TICKS)*tickMultiplier;
            } else if (snake.direction == Enums.Directions.DOWN) {
                snake.position.y -= (totalSpeed * UPDATE_EVERY_N_TICKS)*tickMultiplier;
            } else if (snake.direction == Enums.Directions.RIGHT) {
                snake.position.x += (totalSpeed * UPDATE_EVERY_N_TICKS)*tickMultiplier;
            }

            // Update visual length
            if (snake.actualLength > snake.visualLength) {
                let setTo = snake.visualLength + (totalSpeed * UPDATE_EVERY_N_TICKS);
                if (setTo > snake.actualLength)
                    snake.visualLength = snake.actualLength;
                else
                    snake.visualLength += totalSpeed * UPDATE_EVERY_N_TICKS;
            }
            

            // Collision Checks
            if (
                snake.position.x > this.config.ArenaSize / 2 ||
                snake.position.x < -this.config.ArenaSize / 2 ||
                snake.position.y > this.config.ArenaSize / 2 ||
                snake.position.y < -this.config.ArenaSize / 2
            ) {
                setTimeout(() => { // Make sure they didn't move out of the way
                    if (
                        snake.position.x > this.config.ArenaSize / 2 ||
                        snake.position.x < -this.config.ArenaSize / 2 ||
                        snake.position.y > this.config.ArenaSize / 2 ||
                        snake.position.y < -this.config.ArenaSize / 2
                    ) {
                        snake.kill(Enums.KillReasons.BOUNDARY, snake);
                    }
                }, snake.ping + 30 || 50) // Add a little bit of time to account for ping flucuations
            }
            let secondPoint = snake.points[0];


            //Barrier collision checks
            this.barriers.forEach((barrier) => {
                let x = barrier.x;
                let y = barrier.y;
                let width = barrier.width;
                let height = barrier.height;
                let x1 = x - width/2;
                let x2 = x + width/2;
                let y1 = y - height/2;
                let y2 = y + height/2;
                if (snake.position.x > x1 && snake.position.x < x2 && snake.position.y > y1 && snake.position.y < y2) {
                    setTimeout(() => { // Make sure they didn't move out of the way
                        if (snake.position.x > x1 && snake.position.x < x2 && snake.position.y > y1 && snake.position.y < y2) {
                            snake.kill(Enums.KillReasons.BOUNDARY, snake);
                        }
                    }, snake.ping + 30 || 50) // Add a little bit of time to account for ping flucuations
                }
            })

            // Other snake collision checks
            let closestRubLine
            Object.values(snake.client.loadedEntities).forEach((otherSnake) => {
                if (otherSnake.type != Enums.EntityTypes.ENTITY_PLAYER)
                    return
                // Check if head of snake of near body of other snake

                
                let nearbyPoints = SnakeFunctions.GetPointsNearSnake(snake, otherSnake, 30);
                snake.client.pointsNearby[otherSnake.id] = nearbyPoints;
                for (let i = 0; i < nearbyPoints.length - 1; i++) {
                    numPoints++
                    let point, nextPoint;
                    if (i == -1)
                        point = otherSnake.position;
                    else
                        point = nearbyPoints[i];
                    nextPoint = nearbyPoints[i + 1];
                    if (nextPoint.index != point.index + 1)
                        continue
                    point = point.point;
                    nextPoint = nextPoint.point;
                    // Rubbing Mechanics

                    let canRub = () => {
                        let direction = MapFunctions.GetNormalizedDirection(point, nextPoint);
                        let snakeDirection = MapFunctions.GetNormalizedDirection(snake.position, secondPoint);
                        /*if (!(Math.abs(direction.x) == Math.abs(snakeDirection.x) && Math.abs(direction.y) == Math.abs(snakeDirection.y))) { // Check if this line is in the same direction or opposite direction
                            return false
                        }

                        if (i == 0) { // First segment
                            let distFromHead = SnakeFunctions.GetHeadDistance(snake, otherSnake)
                            if (distFromHead > 0) {
                                return false
                            }
                        }*/
                        let nearestPoint = MapFunctions.NearestPointOnLine(
                            snake.position,
                            point,
                            nextPoint
                        );
                        if (nearestPoint.distance < 4)
                            return nearestPoint



                        return false

                    }
                    
                    if (otherSnake.id != snake.id) {
                        let nearestRubPoint = canRub()
                        if (nearestRubPoint) {
                            if (!closestRubLine || nearestRubPoint.distance < closestRubLine.distance)
                                closestRubLine = {
                                    point: nearestRubPoint.point,
                                    distance: nearestRubPoint.distance,
                                    otherSnake: otherSnake
                                }
                        }
                        
                    }
                    

                    // Collision Mechanics
                    if (snake.position != nextPoint && secondPoint != point && snake.position != secondPoint && snake.position != point) {
                        if (MapFunctions.DoIntersect(snake.position, secondPoint, point, nextPoint)) {
                            setTimeout(() => { // Make sure they didn't move out of the way
                                if (snake.position != nextPoint && secondPoint != point && snake.position != secondPoint && snake.position != point) {
                                    if (MapFunctions.DoIntersect(snake.position, secondPoint, point, nextPoint)) {
                                        if (snake.id == otherSnake.id) {
                                            snake.kill(Enums.KillReasons.SELF, snake);
                                        } else {
                                            snake.kill(Enums.KillReasons.KILLED, otherSnake);
                                        }
                                    }
                                }
                            }, snake.ping + 30 || 50) // Add a little bit of time to account for ping flucuations
                        }
                    }

                    // Check if any points are colliding

                }
            })
            if (closestRubLine) {
                snake.rubX = closestRubLine.point.x;
                snake.rubY = closestRubLine.point.y;
                snake.rubAgainst(closestRubLine.otherSnake, closestRubLine.distance);
                snake.rubbing = true
            } else {
                snake.stopRubbing();
                snake.rubbing = false
            }
            if (Date.now()-snake.lastAte > 500)
                snake.eatCombo = 0
            if (snake.eatCombo >= 5 && (snake.extraSpeed+1 <= this.config.MaxBoostSpeed || this.speedBypass)) {
                snake.extraSpeed += 2;
                snake.speed = 0.25 + (snake.extraSpeed / 1000)
                snake.speeding = true;
            } else {
                snake.speeding = false;
            }
            if ((!snake.speeding && !snake.rubbing && !snake.lockspeed) && snake.extraSpeed-1 >= 0) {
                snake.extraSpeed -= 1;
                snake.speed = 0.25 + (snake.extraSpeed / 1000);
            }
        });
        //console.log(`Updated ${numSnak} snakes and ${numPoints} points`)
    }

    main() {
        this.UpdateArena()
        this.RefreshLeaderboard()

        // Add random food spawns
        if (Object.keys(this.entities).length < this.maxNaturalFood) {
            if (Math.random() * 100 < this.foodSpawnPercent) {
                new Food(this);
            }
            
        }

        
        Object.values(this.clients).forEach((client) => {
            var snake = client.snake;
            
            //if (!snake)
                //return
            let isSpawned = !client.dead;

            if (isSpawned || !client.spectating) {
                let entQuery = SnakeFunctions.GetEntitiesNearClient(client);
                
                
                
                let nearbyEntities = entQuery.entitiesToAdd;
                let removeEntities = entQuery.entitiesToRemove;
                let entitiesInRadius = entQuery.entitiesInRadius;

                
                
                
                
                let updateEntities = []
                
                Object.values(client.loadedEntities).forEach((entity) => {
                    switch (entity.type) {
                        case Enums.EntityTypes.ENTITY_PLAYER:
                            updateEntities.push(entity)
                            
                            break
                        case Enums.EntityTypes.ENTITY_ITEM:
                            if (entity.lastUpdate > this.lastUpdate) {
                                updateEntities.push(entity)
                            }

                            if (entity.subtype == Enums.EntitySubtypes.SUB_ENTITY_ITEM_FOOD && isSpawned) {
                                let distance = Math.sqrt(
                                    Math.pow(snake.position.x - entity.position.x, 2) +
                                    Math.pow(snake.position.y - entity.position.y, 2)
                                );
                                if (distance < 3) {
                                    entity.eat(snake);
                                }
                            }
                            break

                    }
                })

                client.update(Enums.UpdateTypes.UPDATE_TYPE_FULL, nearbyEntities);
                client.update(Enums.UpdateTypes.UPDATE_TYPE_DELETE, removeEntities);
                client.update(Enums.UpdateTypes.UPDATE_TYPE_PARTIAL, updateEntities);

                if (isSpawned) {
                    snake.killedSnakes.forEach((killedSnake, index) => {
                        if (killedSnake.client.snake || !this.clients[killedSnake.client.id]) {// If the snake respawned or disconnected, remove it from the list
                            snake.client.spectating = false;
                            delete snake.killedSnakes[index]
                            return
                        }
                        killedSnake.client.update(Enums.UpdateTypes.UPDATE_TYPE_FULL, nearbyEntities)
                        killedSnake.client.update(Enums.UpdateTypes.UPDATE_TYPE_DELETE, removeEntities)
                        killedSnake.client.update(Enums.UpdateTypes.UPDATE_TYPE_PARTIAL, updateEntities)

                    })
                    // HANDLE TALK STAMINA
                    if (snake.talkStamina < 255) {
                        this.snakes[snake.id].talkStamina += 5;
                        if (snake.talkStamina > 255)
                            this.snakes[snake.id].talkStamina = 255;
                    }
                    // CALCULATE TAIL LENGTH
                    let totalPointLength = 0;
                    for (let i = -1; i < snake.points.length - 1; i++) {
                        let point;
                        if (i == -1)
                            point = snake.position;
                        else
                            point = snake.points[i];
                        let nextPoint = snake.points[i + 1];
                        
                        let segmentLength = getSegmentLength(point, nextPoint);
                        
                        totalPointLength += segmentLength;
                    }

                    while (totalPointLength > snake.visualLength) {
                        let secondToLastPoint = snake.points[snake.points.length - 2] || snake.position;
                        let lastPoint = snake.points[snake.points.length - 1] || snake.position;
                        let direction = MapFunctions.GetNormalizedDirection(secondToLastPoint, lastPoint);

                        let amountOverLength = totalPointLength - snake.visualLength;
                        let lastSegmentLength = getSegmentLength(secondToLastPoint, lastPoint);

                        if (lastSegmentLength > amountOverLength) { // Last segment can be decreased to fit length
                            let newPoint = {
                                x: lastPoint.x - direction.x * amountOverLength,
                                y: lastPoint.y - direction.y * amountOverLength
                            }
                            snake.points[snake.points.length - 1] = newPoint;
                            totalPointLength = snake.visualLength;
                        } else { // Last segment is too short, remove it and decrease the next one
                            totalPointLength -= lastSegmentLength;
                            snake.points.pop();
                        }
                    }
                    
                    // HANDLE LEADERBOARD
                    
                    snake.updateLeaderboard();
                }
            }
            
        })
        Object.values(this.clients).forEach(function (client) {
            let snake = client.snake;
            if (snake)
                snake.newPoints = []
        })
        this.lastUpdate = Date.now();
    }

    start() {
        this.startTime = Date.now();
        this.main();
        this.endTime = Date.now();
        const drift = this.endTime - this.startTime
        const nextInterval = Math.max(0, this.config.UpdateInterval - drift);
        setTimeout(() => {
            this.start()
        }, nextInterval);
    }
        
        
        
        
}

module.exports = Server;