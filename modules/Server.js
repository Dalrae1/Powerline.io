const WebSocket = require('ws');
const HttpsServer = require('https').createServer;
const fs = require("fs");


const IDManager = require("./IDManager.js");
const Enums = require("./Enums.js");
const Food = require("./Food.js");
const Snake = require("./Snake.js");
const MapFunctions = require("./MapFunctions.js");
const { EntityFunctions, SnakeFunctions } = require("./EntityFunctions.js");
const Quadtree = require("./Quadtree.js");
const Client = require("./Client.js");


function getSegmentLength(point1, point2) {
    return Math.abs(Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)));
}

class Server {
    constructor(serverId) {
        this.config = {
            // Client config
            ConfigType: Enums.ServerToClient.OPCODE_CONFIG,
            ArenaSize: 300,
            DefaultZoom: 2,
            MinimumZoom: 1.5,
            MinimumZoomScore: 100,
            ZoomLevel2: 10,
            GlobalWebLag: 90,
            GlobalMobileLag: 60, // Not used
            OtherSnakeDelay: 40,
            IsTalkEnabled: 1,

            // Server config
            FoodValue: 1.5,
            UpdateInterval: 100,
            MaxBoostSpeed: 255,
            MaxRubSpeed: 200,
            DefaultLength: 10,
        }

        this.entityIDs = new IDManager();
        this.clientIDs = new IDManager();
        this.entityQuadtree = new Quadtree({
            x: -this.config.ArenaSize / 2,
            y: -this.config.ArenaSize / 2,
            width: this.config.ArenaSize,
            height: this.config.ArenaSize
        }, 10)

        this.scoreMultiplier = 10/this.config.FoodValue;
        this.foodMultiplier = 1;
        this.maxFood = this.config.ArenaSize * 5;
        this.foodSpawnPercent = (this.config.ArenaSize ^ 2) / 10;
        this.artificialPing = 0;



        this.king = null;
        this.lastUpdate = 0;
        this.admins = [
            "73.96.77.58",
            "127.0.0.1",
        ];
        this.entities = [];
        this.clients = [];
        this.snakes = [];

        this.performance = {
            tempStart: 0,
            moveTime: 0,
            visualLengthTime: 0,
            getNearbyPointsTime: 0,
            collisionCheckTime: 0,
            rubCheckTime: 0,
            talkStaminaTime: 0,
            tailLengthTime: 0,
            leaderboardTime: 0,
            entitiesNearClientTime: 0
        }


        if (fs.existsSync("C:\\Certbot\\live\\dalr.ae\\cert.pem")) {
            let cert = fs.realpathSync("C:\\Certbot\\live\\dalr.ae\\cert.pem")
            let key = fs.realpathSync("C:\\Certbot\\live\\dalr.ae\\privkey.pem")
            let chain = fs.realpathSync("C:\\Certbot\\live\\dalr.ae\\fullchain.pem")
            let server = HttpsServer({
                cert: fs.readFileSync(cert),
                key: fs.readFileSync(key)
            })
            this.secureServer = new WebSocket.Server({ server: server });
            server.listen(serverId+1);
        }
        this.unsecureServer = new WebSocket.Server({ port: serverId });
        
        if (this.secureServer) {
            this.secureServer.on('connection', (ws, req) => {
                let client = new Client(this, ws, req.socket.remoteAddress);
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
            });
        }

        this.unsecureServer.on('connection', (ws, req) => {
            let client = new Client(this, ws, req.socket.remoteAddress);
            
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
        });

        for (let i = 0; i < this.maxFood; i++) {
            new Food(this);
        }

        this.mainLooper()
    }

    UpdateArena() {
        let numSnak = 0;
        let numPoints = 0;
        Object.values(this.snakes).forEach((snake) => {
            numSnak++
            this.performance.tempStart = Date.now();
            // Make snakes move
            let totalSpeed = snake.speed //+ (snake.extraSpeed/255);
            if (snake.direction == Enums.Directions.UP) {
                snake.position.y += totalSpeed * UPDATE_EVERY_N_TICKS;
            } else if (snake.direction == Enums.Directions.LEFT) {
                snake.position.x -= totalSpeed * UPDATE_EVERY_N_TICKS;
            } else if (snake.direction == Enums.Directions.DOWN) {
                snake.position.y -= totalSpeed * UPDATE_EVERY_N_TICKS;
            } else if (snake.direction == Enums.Directions.RIGHT) {
                snake.position.x += totalSpeed * UPDATE_EVERY_N_TICKS;
            }
            this.performance.moveTime += Date.now() - this.performance.tempStart;
            this.performance.tempStart = Date.now();

            // Update visual length
            if (snake.actualLength > snake.visualLength) {
                let setTo = snake.visualLength + (totalSpeed * UPDATE_EVERY_N_TICKS);
                if (setTo > snake.actualLength)
                    snake.visualLength = snake.actualLength;
                else
                    snake.visualLength += totalSpeed * UPDATE_EVERY_N_TICKS;
            }
            this.performance.visualLengthTime += Date.now() - this.performance.tempStart;
            

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
                }, snake.ping || 50)
            }
            let shouldRub = false;
            let secondPoint = snake.points[0];
            // Other snake collision checks
            let closestRubLine
            Object.values(snake.client.loadedEntities).forEach((otherSnake) => {
                if (otherSnake.type != Enums.EntityTypes.ENTITY_PLAYER)
                    return
                // Check if head of snake of near body of other snake

                

                //for (let i = -1; i < otherSnake.points.length - 1; i++) {
                this.performance.tempStart = Date.now();
                let nearbyPoints = SnakeFunctions.GetPointsNearSnake(snake, otherSnake, 30);
                this.performance.getNearbyPointsTime += Date.now() - this.performance.tempStart;
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

                    this.performance.tempStart = Date.now();
                    // Rubbing Mechanics
                    if (otherSnake.id != snake.id) {
                        if (otherSnake.RubSnake != snake.id) {
                            if (i <= otherSnake.points.length - 1) {
                                let data = MapFunctions.NearestPointOnLine(
                                    snake.position,
                                    point,
                                    nextPoint
                                );
                                // Check if this line is in the same direction
                                let direction = MapFunctions.GetNormalizedDirection(point, nextPoint);
                                let snakeDirection = MapFunctions.GetNormalizedDirection(snake.position, secondPoint);
                                let noRub = false;
                                if (direction && snakeDirection) {
                                    if (!(Math.abs(direction.x) == Math.abs(snakeDirection.x) && Math.abs(direction.y) == Math.abs(snakeDirection.y)))
                                        noRub = true
                                    if (data.distance >= 4)
                                        noRub = true
                                    if (closestRubLine && data.distance > closestRubLine.distance)
                                        noRub = true
                                    if (!noRub)
                                        closestRubLine = {
                                            point: data.point,
                                            distance: data.distance
                                        }
                                }
                            }
                        }
                        
                    }
                    this.performance.rubCheckTime += Date.now() - this.performance.tempStart;
                    

                    // Collision Mechanics

                    this.performance.tempStart = Date.now();
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
                            }, snake.ping || 50)
                        }
                    }
                    this.performance.collisionCheckTime += Date.now() - this.performance.tempStart;

                    // Check if any points are colliding

                }
                if (closestRubLine) {
                    shouldRub = true;
                    snake.rubX = closestRubLine.point.x;
                    snake.rubY = closestRubLine.point.y;
                    snake.rubAgainst(otherSnake, closestRubLine.distance);
                }
            })
            if (!shouldRub) {
            snake.stopRubbing();
            }

            if (!snake.speeding) {
                if (snake.extraSpeed-2 > 0) {
                    snake.extraSpeed -= 2;
                    snake.speed = 0.25 + snake.extraSpeed / (255 * UPDATE_EVERY_N_TICKS);
                }

            }
        });
        //console.log(`Updated ${numSnak} snakes and ${numPoints} points`)
    }

    main() {
        this.performance.moveTime = this.performance.visualLengthTime = this.performance.getNearbyPointsTime = this.performance.collisionCheckTime = this.performance.rubCheckTime = this.performance.talkStaminaTime = this.performance.tailLengthTime = this.performance.leaderboardTime = this.performance.entitiesNearClientTime = 0
        this.UpdateArena()

        // Add random food spawns
        if (Object.keys(this.entities).length < this.maxFood) {
            if (Math.random() * 100 < this.foodSpawnPercent) {
                new Food(this);
            }
            
        }

        
        Object.values(this.clients).forEach((client) => {
            var snake = client.snake;
            
            //if (!snake)
                //return
            let isSpawned = !client.dead;
            
            this.performance.tempStart = Date.now();
            let entQuery = SnakeFunctions.GetEntitiesNearClient(client);
            this.performance.entitiesNearClientTime += Date.now() - this.performance.tempStart;
            
            
            
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
                        delete snake.killedSnakes[index]
                        return
                    }
                })
            }

            
            if (isSpawned) {

                // HANDLE TALK STAMINA
                this.performance.tempStart = Date.now();
                if (snake.talkStamina < 255) {
                    this.snakes[snake.id].talkStamina += 5;
                    if (snake.talkStamina > 255)
                        this.snakes[snake.id].talkStamina = 255;
                }
                this.performance.talkStaminaTime += Date.now() - this.performance.tempStart;




                this.performance.tempStart = Date.now();
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
                
                if (totalPointLength > snake.visualLength) {
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
                    } else { // Last segment is too short, remove it and decrease the next one
                        snake.points.pop();
                    }
                }
                this.performance.tailLengthTime += Date.now() - this.performance.tempStart;
                
                // HANDLE LEADERBOARD
                
                this.performance.tempStart = Date.now();
                snake.updateLeaderboard();
                this.performance.leaderboardTime += Date.now() - this.performance.tempStart;
            }
            
        })
        Object.values(this.clients).forEach(function (client) {
            let snake = client.snake;
            if (snake)
                snake.newPoints = []
        })
    }

    mainLooper() {
        setTimeout(() => {
            if (Date.now() - this.lastUpdate >= this.config.UpdateInterval) {
                if ((Date.now() - this.lastUpdate) > this.config.UpdateInterval) {




                }
                this.main()
                this.lastUpdate = Date.now();
                
            }
            this.mainLooper()
        }, 1)
    }
}

module.exports = Server;