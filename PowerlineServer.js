const WebSocket = require('ws');
const HttpsServer = require('https').createServer;
const fs = require("fs");
arenaSize = 300

/* Required */
const IDManager = require("./modules/IDManager.js");
const Enums = require("./modules/Enums.js");
const Food = require("./modules/Food.js");
const Snake = require("./modules/Snake.js");
const MapFunctions = require("./modules/MapFunctions.js");
const { EntityFunctions, SnakeFunctions } = require("./modules/EntityFunctions.js");
const Quadtree = require("./modules/Quadtree.js");
const Client = require("./modules/Client.js");

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
artificialPing = 0;
entityIDs = new IDManager();
clientIDs = new IDManager();
entityQuadTree = new Quadtree({
    x: -arenaSize / 2,
    y: -arenaSize / 2,
    width: arenaSize,
    height: arenaSize
}, 10);
    
entities = {}
clients = {}
snakes = {}
globalWeblag = 90;
foodValue = 1.5;
lastClientId = 1
updateInterval = 100
UPDATE_EVERY_N_TICKS = 3;
maxBoostSpeed = 255;
maxRubSpeed = 200;
scoreMultiplier = 10/foodValue;
defaultLength = 10;
king = null;
lastUpdate = 0;
maxFood = 0//arenaSize * 5;
foodSpawnPercent = (arenaSize ^ 2) / 10;
foodMultiplier = 1;
admins = [
    "73.96.77.58",
    "127.0.0.1",
]
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

function round(num) {
    return Math.round(num / 1000) * 1000
}

for (let i = 0; i < maxFood; i++) {
    new Food();
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
        ws.on('message', async function incoming(message, req) {
            let view = new DataView(new Uint8Array(message).buffer);
            let messageType = view.getUint8(0);
            client.RecieveMessage(messageType, view)
        })
        ws.on('close', function close() {
            if (client.snake && client.snake.id) {
                client.snake.kill(Enums.KillReasons.LEFT_SCREEN, client.snake);
                
            }
            delete clients[client.id];
        })
    });
}

wss.on('connection', async function connection(ws, req) {
    let client = new Client(ws, req.socket.remoteAddress);
    ws.on('message', async function incoming(message, req) {
        let view = new DataView(new Uint8Array(message).buffer);
        let messageType = view.getUint8(0);
        client.RecieveMessage(messageType, view)
    })
    ws.on('close', function close() {
        if (client.snake && client.snake.id) {
            client.snake.kill(Enums.KillReasons.LEFT_SCREEN, client.snake);
            
        }
        clientIDs.releaseID(client.id)
        delete clients[client.id];
    })
});

function getSegmentLength(point1, point2) {
    return Math.abs(Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)));
}

let moveTime = visualLengthTime = getNearbyPointsTime = collisionCheckTime = rubCheckTime = talkStaminaTime = tailLengthTime = leaderboardTime = entitiesNearClientTime = 0
let tempStart = 0;


function UpdateArena() { // Main update loop
    let numSnak = 0;
    let numPoints = 0;
    Object.values(snakes).forEach(function (snake) {
        numSnak++
        tempStart = Date.now();
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
        moveTime += Date.now() - tempStart;
        tempStart = Date.now();

        /* Update visual length */
        if (snake.actualLength > snake.visualLength) {
            let setTo = snake.visualLength + (totalSpeed * UPDATE_EVERY_N_TICKS);
            if (setTo > snake.actualLength)
                snake.visualLength = snake.actualLength;
            else
                snake.visualLength += totalSpeed * UPDATE_EVERY_N_TICKS;
        }
        visualLengthTime += Date.now() - tempStart;
        

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
                    snake.kill(Enums.KillReasons.BOUNDARY, snake);
                }
            }, snake.ping || 50)
        }
        let shouldRub = false;
        let secondPoint = snake.points[0];
        // Other snake collision checks
        let closestRubLine
        Object.values(snake.client.loadedEntities).forEach(function (otherSnake) {
            if (otherSnake.type != Enums.EntityTypes.ENTITY_PLAYER)
                return
            // Check if head of snake of near body of other snake

            

            //for (let i = -1; i < otherSnake.points.length - 1; i++) {
            tempStart = Date.now();
            let nearbyPoints = SnakeFunctions.GetPointsNearSnake(snake, otherSnake, 30);
            getNearbyPointsTime += Date.now() - tempStart;
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

                tempStart = Date.now();
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
                rubCheckTime += Date.now() - tempStart;
                

                // Collision Mechanics

                tempStart = Date.now();
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
                collisionCheckTime += Date.now() - tempStart;

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
    moveTime = visualLengthTime = getNearbyPointsTime = collisionCheckTime = rubCheckTime = talkStaminaTime = tailLengthTime = leaderboardTime = entitiesNearClientTime = 0
    UpdateArena()

    // Add random food spawns
    if (Object.keys(entities).length < maxFood) {
        if (Math.random()*100 < foodSpawnPercent) {
            new Food();
        }
        
    }

    
    Object.values(clients).forEach(function (client) {
        var snake = client.snake;
        
        //if (!snake)
            //return
        let isSpawned = !client.dead;
        
        tempStart = Date.now();
        let entQuery = SnakeFunctions.GetEntitiesNearClient(client);
        entitiesNearClientTime += Date.now() - tempStart;
        
        
        
        let nearbyEntities = entQuery.entitiesToAdd;
        let removeEntities = entQuery.entitiesToRemove;
        let entitiesInRadius = entQuery.entitiesInRadius;

        
        
        
        
        let updateEntities = []
        
        Object.values(client.loadedEntities).forEach(function (entity) {
            switch (entity.type) {
                case Enums.EntityTypes.ENTITY_PLAYER:
                    updateEntities.push(entity)
                    
                    break
                case Enums.EntityTypes.ENTITY_ITEM:
                    if (entity.lastUpdate > lastUpdate) {
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
                if (killedSnake.client.snake || !clients[killedSnake.client.id]) {// If the snake respawned or disconnected, remove it from the list
                    delete snake.killedSnakes[index]
                    return
                }
            })
        }

        
        if (isSpawned) {

            /* HANDLE TALK STAMINA */
            tempStart = Date.now();
            if (snake.talkStamina < 255) {
                snakes[snake.id].talkStamina += 5;
                if (snake.talkStamina > 255)
                    snakes[snake.id].talkStamina = 255;
            }
            talkStaminaTime += Date.now() - tempStart;




            tempStart = Date.now();
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
            tailLengthTime += Date.now() - tempStart;
            

            /* HANDLE LEADERBOARD */
            
            tempStart = Date.now();
            snake.updateLeaderboard();
            leaderboardTime += Date.now() - tempStart;
        }
        
    })
    Object.values(clients).forEach(function (client) {
        let snake = client.snake;
        if (snake)
            snake.newPoints = []
    })
    

}

function mainLooper() {
    setTimeout(() => {
        if (Date.now() - lastUpdate >= updateInterval) {
            if ((Date.now() - lastUpdate) > updateInterval) {
                /*console.log(`Server is lagging ${(Date.now() - lastUpdate) - updateInterval}ms behind...`)
                console.log(`\tMove: ${moveTime}ms`)
                console.log(`\tVisual Length: ${visualLengthTime}ms`)
                console.log(`\tGet Nearby Points: ${getNearbyPointsTime}ms`)
                console.log(`\tCollision Check: ${collisionCheckTime}ms`)
                console.log(`\tRub Check: ${rubCheckTime}ms`)
                console.log(`\tTalk Stamina: ${talkStaminaTime}ms`)
                console.log(`\tTail Length: ${tailLengthTime}ms`)
                console.log(`\tLeaderboard: ${leaderboardTime}ms`)
                console.log(`\tEntities Near Client: ${entitiesNearClientTime}ms`)*/




            }
            main()
            lastUpdate = Date.now();
            
        }
        mainLooper()
    }, 1)
}

mainLooper()