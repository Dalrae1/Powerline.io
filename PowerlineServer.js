const WebSocket = require('ws');
const HttpsServer = require('https').createServer;
const fs = require("fs");
const EventEmitter = require("events");


/* Required */
const IDManager = require("./modules/IDManager.js");
const Enums = require("./modules/Enums.js");
const Food = require("./modules/Food.js");
const Snake = require("./modules/Snake.js");
const MapFunctions = require("./modules/MapFunctions.js");
const { EntityFunctions, SnakeFunctions } = require("./modules/EntityFunctions.js");

let server, wssSecure

if (fs.existsSync("C:\\Certbot\\live\\dalr.ae\\cert.pem")) {
    let cert = fs.realpathSync("C:\\Certbot\\live\\dalr.ae\\cert.pem")
    let key = fs.realpathSync("C:\\Certbot\\live\\dalr.ae\\privkey.pem")
    let chain = fs.realpathSync("C:\\Certbot\\live\\dalr.ae\\fullchain.pem")
    server = HttpsServer({
        cert: fs.readFileSync(cert),
        key: fs.readFileSync(key)
    })
    wssSecure = new WebSocket.Server({ server: server });
    server.listen(1338);
    
}

const wss = new WebSocket.Server({ port: 1337});
// Global variables
entityIDs = new IDManager();
entities = {}
clients = {}
snakes = {}
arenaSize = 300
foodValue = 1.5;
lastClientId = 1
updateDuration = 90
UPDATE_EVERY_N_TICKS = 3;
maxBoostSpeed = 255;
maxRubSpeed = 200;
scoreMultiplier = 10/foodValue;
defaultLength = 10;
king = null;
lastUpdate = 0;
maxFood = arenaSize * 5;
foodSpawnPercent = (arenaSize ^ 2) / 10;
foodMultiplier = 1;
admins = [
    "73.96.77.58",
    "127.0.0.1",
    "64.112.210.252"
]


for (let i = 0; i < maxFood; i++) {
    new Food();
}

let newSnakes = [];

function round(num) {
    return Math.round(num / 1000) * 1000
}
class Client extends EventEmitter {
    constructor(websocket, ip) {
        super();
        this.socket = websocket;
        this.nick = "";
        this.id = 0;
        if (ip.toString() == "::1") // Set IP to local
            ip = "::ffff:127.0.0.1"
            
        this.ip = (ip.toString()).split(":")[3];
        console.log(`Client connected from "${this.ip}"`);
    }
}




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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
if (wssSecure) {
    wssSecure.on('connection', async function connection(ws, req) {
        let client = new Client(ws, req.socket.remoteAddress);
        let snake = new Snake(client);
        ws.on('message', async function incoming(message, req) {
            let view = new DataView(new Uint8Array(message).buffer);
            let messageType = view.getUint8(0);
            snake.RecieveMessage(messageType, view)
        })
        ws.on('close', function close() {
            if (snake.id) {
                snake.kill(Enums.KillReasons.LEFT_SCREEN, snake.id);
                delete clients[snake.id];
            }
        })
    });
}

wss.on('connection', async function connection(ws, req) {
    let client = new Client(ws, req.socket.remoteAddress);
    let snake = new Snake(client);
    ws.on('message', async function incoming(message, req) {
        let view = new DataView(new Uint8Array(message).buffer);
        let messageType = view.getUint8(0);
        snake.RecieveMessage(messageType, view)
    })
    ws.on('close', function close() {
        if (snake.id) {
            snake.kill(Enums.KillReasons.LEFT_SCREEN, snake.id);
            delete clients[snake.id];
        }
    })
});

function getSegmentLength(point1, point2) {
    return Math.abs(Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)));
}


function UpdateArena() { // Main update loop
    let numSnak = 0;
    let numPoints = 0;
    Object.values(snakes).forEach(function (snake) {
        numSnak++
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

        // Collision Checks
        if (
            snake.position.x > arenaSize / 2 ||
            snake.position.x < -arenaSize / 2 ||
            snake.position.y > arenaSize / 2 ||
            snake.position.y < -arenaSize / 2
        ) {
            setTimeout(() => { // Make sure they didn't move out of the way
                if (
                    snake.position.x > arenaSize / 2 ||
                    snake.position.x < -arenaSize / 2 ||
                    snake.position.y > arenaSize / 2 ||
                    snake.position.y < -arenaSize / 2
                ) {
                    snake.kill(Enums.KillReasons.BOUNDARY, snake.id);
                }
            }, snake.ping || 50)
        }
        let shouldRub = false;
        let secondPoint = snake.points[0];
        // Other snake collision checks
        Object.values(snake.loadedEntities).forEach(function (otherSnake) {
            if (otherSnake.type != Enums.EntityTypes.ENTITY_PLAYER)
                return
            // Check if head of snake of near body of other snake

            let closestRubLine

            //for (let i = -1; i < otherSnake.points.length - 1; i++) {
            let nearbyPoints = SnakeFunctions.GetPointsNearSnake(snake, otherSnake, 30);
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
                if (otherSnake.id != snake.id) {
                    
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
                

                // Collision Mechanics

                if (snake.position != nextPoint && secondPoint != point && snake.position != secondPoint && snake.position != point) {
                    if (MapFunctions.DoIntersect(snake.position, secondPoint, point, nextPoint)) {
                        setTimeout(() => { // Make sure they didn't move out of the way
                            if (snake.position != nextPoint && secondPoint != point && snake.position != secondPoint && snake.position != point) {
                                if (MapFunctions.DoIntersect(snake.position, secondPoint, point, nextPoint)) {
                                    if (snake.id == otherSnake.id) {
                                        snake.kill(Enums.KillReasons.SELF, snake.id);
                                    } else {
                                        snake.kill(Enums.KillReasons.KILLED, otherSnake.id);
                                    }
                                }
                            }
                        }, snake.ping || 50)
                    }
                }

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

async function main() {
    let timeStart = Date.now();
    UpdateArena()
    //console.log(`UpdateArena took ${Date.now() - timeStart}ms`)

    // Add random food spawns
    
    
    if (Object.keys(entities).length < maxFood) {
        if (Math.random()*100 < foodSpawnPercent) {
            new Food();
        }
        
    }

    let testTime = 0
    Object.values(clients).forEach(function (snake) {
        //let numUpdatedEntities = 0
        //let numCreatedEntities = 0
        //let numRemovedEntities = 0
        let isSpawned = snake.spawned;
        if (snake.id) {
            
            let entQuery = SnakeFunctions.GetEntitiesNearSnake(snake);
            
            
            let nearbyEntities = entQuery.entitiesToAdd;
            let removeEntities = entQuery.entitiesToRemove;
            //numCreatedEntities += Object.values(nearbyEntities).length
            //numRemovedEntities += Object.values(removeEntities).length

            
            snake.update(Enums.UpdateTypes.UPDATE_TYPE_FULL, nearbyEntities);
            snake.update(Enums.UpdateTypes.UPDATE_TYPE_DELETE, removeEntities)
            
            
            let updateEntities = []
            Object.values(snake.loadedEntities).forEach(function (entity) {
                switch (entity.type) {
                    case Enums.EntityTypes.ENTITY_PLAYER:
                        //numUpdatedEntities++
                        updateEntities.push(entity)
                        
                        break
                    case Enums.EntityTypes.ENTITY_ITEM:
                        if (entity.lastUpdate > lastUpdate) {
                            //numUpdatedEntities++
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
            snake.update(Enums.UpdateTypes.UPDATE_TYPE_PARTIAL, updateEntities);
            
            //console.log(`Updated ${numUpdatedEntities} entities, created ${numCreatedEntities} entities, removed ${numRemovedEntities} entities for snake ${snake.id}`)

            if (snake.spawned) {

                /* HANDLE TALK STAMINA */
                if (snake.talkStamina < 255) {
                    snakes[snake.id].talkStamina += 5;
                    if (snake.talkStamina > 255)
                        snakes[snake.id].talkStamina = 255;
                }




                /* CALCULATE TAIL LENGTH */
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
                if (totalPointLength > snake.length) {
                    let secondToLastPoint = snake.points[snake.points.length - 2] || snake.position;
                    let lastPoint = snake.points[snake.points.length - 1] || snake.position;
                    let direction = MapFunctions.GetNormalizedDirection(secondToLastPoint, lastPoint);

                    let amountOverLength = totalPointLength - snake.length;
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

                /* HANDLE LEADERBOARD */
                let startTime2 = Date.now();
                snake.updateLeaderboard();
                testTime += Date.now() - startTime2
                
            }
        }
    })

    //console.log(`testTime took took ${testTime}ms`)
    Object.values(clients).forEach(function (snake) {
        snake.newPoints = []
    })
    lastUpdate = Date.now();

}

function mainLooper() {
    setTimeout(() => {
        if (Date.now()-lastUpdate >= updateDuration)
            main()
        mainLooper()
    }, 1)
}


function SimulateGame(first) { // Simulate as if there is a ton of players
    if (first)
        for (let i = 0; i < 100; i++) {
            let snake = new Snake({ socket: { send: () => { } } }, true)
            snake.spawn("Simulated")
        }
    
    Object.values(snakes).forEach(function (snake) {
        if (snake.simulated) {
            let shouldTurn = Math.random() * 100 < 1;
            if (shouldTurn) {
                let direction = Math.floor(Math.random() * 4);
                let vector;

                switch (direction) {
                    case Enums.Directions.UP:
                        vector = snake.position.y;
                        break
                    case Enums.Directions.LEFT:
                        vector = snake.position.x;
                        break
                    case Enums.Directions.DOWN:
                        vector = snake.position.y;
                        break
                    case Enums.Directions.RIGHT:
                        vector = snake.position.x;
                        break
                }
                snake.turn(direction, vector);
            }
        }

        

    })

    setTimeout(() => {
        SimulateGame()
    }, 10)

}
//SimulateGame(true)

mainLooper()