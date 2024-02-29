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

function entitiesWithinRadius(center, entities, checksnake) {
    let windowSizeX = checksnake.windowSizeX;
    let windowSizeY = checksnake.windowSizeY;
    let xMin = center.x - windowSizeX / 2;
    let xMax = center.x + windowSizeX / 2;
    let yMin = center.y - windowSizeY / 2;
    let yMax = center.y + windowSizeY / 2;
    let foundEntities = [];
    entities.forEach((entity) => {
        switch (entity.type) {
            case Enums.EntityTypes.ENTITY_PLAYER:
                for (let i = -1; i < entity.points.length - 1; i++) {
                    let point;
                    if (i == -1)
                        point = entity.position;
                    else
                        point = entity.points[i];
                    let nextPoint = entity.points[i + 1];
                    if (MapFunctions.LineInsideOrIntersectsRectangle(point, nextPoint, center, windowSizeX, windowSizeY)) {
                        foundEntities.push(entity);
                    }
                    
                }
                break
            case Enums.EntityTypes.ENTITY_ITEM:
                if (entity.position.x >= xMin && entity.position.x <= xMax && entity.position.y >= yMin && entity.position.y <= yMax) {
                    foundEntities.push(entity);
                    break;
                }
                break
        }
    })
    return foundEntities
}

function pointsNearSnake(player1, player2, distance) {
    let width = distance;
    let height = distance;
    let foundPoints = [];
    let lastPointFound = false
    let center = player1.position
    let points = player2.points
    for (let i = -1; i < points.length - 1; i++) {
        let point = points[i];
        let nextPoint = points[i + 1];
        if (i == -1)
            point = player2.position
        if (!nextPoint)
            break
        if (MapFunctions.LineInsideOrIntersectsRectangle(point, nextPoint, center, width, height)) {
            if (!lastPointFound) {
                foundPoints.push({
                    index: i,
                    point: point
                });
            }
            foundPoints.push({
                index: i + 1,
                point: nextPoint
            });
            lastPointFound = true
        }
        else {
            lastPointFound = false
        }
    }
    return foundPoints
}

function getScoreToDrop(length) {
    let score = (length - defaultLength)*scoreMultiplier
    let x = Math.ceil(Math.random() * 30 * 10) / 10
    return Math.floor(((score - (score - x) / 6) + 70) / 10) * 10
}

function scoreToFood(score) {
    return Math.floor(score / 10)
}
function lengthToScore(length) {
    return (length - defaultLength)*scoreMultiplier
}
function scoreToLength(score) {
    return score/scoreMultiplier
}


for (let i = 0; i < maxFood; i++) {
//for (let i = 0; i < 1000; i++) {
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

function getNormalizedDirection(lineStart, lineEnd) {
    if (lineStart.y > lineEnd.y) {
        return { x: 0, y: -1 }
    }
    else if (lineStart.y < lineEnd.y) {
        return { x: 0, y: 1 }
    }
    else if (lineStart.x < lineEnd.x) {
        return { x: 1, y: 0 }
    }
    else if (lineStart.x > lineEnd.x) {
        return { x: -1, y: 0 }
    }
}

function getSegmentLength(point1, point2) {
    return Math.abs(Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)));
}

function nearestPointOnLine(point, lineStart, lineEnd) // Returns point on line closest to point
{
    let A = point.x - lineStart.x;
    let B = point.y - lineStart.y;
    let C = lineEnd.x - lineStart.x;
    let D = lineEnd.y - lineStart.y;

    let dot = A * C + B * D;
    let len_sq = C * C + D * D;
    let param = -1;
    if (len_sq != 0) //in case of 0 length line
        param = dot / len_sq;

    let xx, yy;

    if (param < 0) {
        xx = lineStart.x;
        yy = lineStart.y;
    } else if (param > 1) {
        xx = lineEnd.x;
        yy = lineEnd.y;
    } else {
        xx = lineStart.x + param * C;
        yy = lineStart.y + param * D;
    }

    let dx = point.x - xx;
    let dy = point.y - yy;
    return { point: { x: xx, y: yy }, distance: Math.sqrt(dx * dx + dy * dy) };
}

function onSegment(p, q, r) 
{ 
    if (q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && 
        q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y)) 
       return true; 
  
    return false; 
} 

function orientation(p, q, r) 
{ 
    // See https://www.geeksforgeeks.org/orientation-3-ordered-points/ 
    // for details of below formula. 
    val = (q.y - p.y) * (r.x - q.x) - 
              (q.x - p.x) * (r.y - q.y); 
  
    if (val == 0) return 0;
  
    return (val > 0)? 1: 2;
} 
  
// The main function that returns true if line segment 'p1q1'  
function doIntersect( p1,  q1,  p2,  q2) 
{ 
    // Find the four orientations needed for general and 
    // special cases 
    o1 = orientation(p1, q1, p2); 
    o2 = orientation(p1, q1, q2); 
    o3 = orientation(p2, q2, p1); 
    o4 = orientation(p2, q2, q1); 
  
    // General case 
    if (o1 != o2 && o3 != o4) 
        return true; 
  
    // Special Cases 
    // p1, q1 and p2 are collinear and p2 lies on segment p1q1 
    if (o1 == 0 && onSegment(p1, p2, q1)) return true; 
  
    // p1, q1 and q2 are collinear and q2 lies on segment p1q1 
    if (o2 == 0 && onSegment(p1, q2, q1)) return true; 
  
    // p2, q2 and p1 are collinear and p1 lies on segment p2q2 
    if (o3 == 0 && onSegment(p2, p1, q2)) return true; 
  
     // p2, q2 and q1 are collinear and q1 lies on segment p2q2 
    if (o4 == 0 && onSegment(p2, q1, q2)) return true; 
  
    return false; // Doesn't fall in any of the above cases 
} 

function getPointAtDistance(snake, distance) // Returns point that is distance away from head
{
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
        if (totalPointLength > distance) { // The point is in this segment
            let segmentOverLength = segmentLength - (totalPointLength-distance);
            let direction = getNormalizedDirection(point, nextPoint);
            let lookForPoint = { x: point.x + (direction.x * segmentOverLength), y: point.y + (direction.y * segmentOverLength) };
            //snake.DrawDebugCircle(point.x, point.y, 100);
            //snake.DrawDebugCircle(nextPoint.x, nextPoint.y, 100);
            //snake.DrawDebugCircle(lookForPoint.x, lookForPoint.y, 20);
            return lookForPoint;

        }
    }
    return snake.position;
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
            let nearbyPoints = pointsNearSnake(snake, otherSnake, 30);
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
                        let data = nearestPointOnLine(
                            snake.position,
                            point,
                            nextPoint
                        );
                        // Check if this line is in the same direction
                        let direction = getNormalizedDirection(point, nextPoint);
                        let snakeDirection = getNormalizedDirection(snake.position, secondPoint);
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
                    if (doIntersect(snake.position, secondPoint, point, nextPoint)) {
                        setTimeout(() => { // Make sure they didn't move out of the way
                            if (snake.position != nextPoint && secondPoint != point && snake.position != secondPoint && snake.position != point) {
                                if (doIntersect(snake.position, secondPoint, point, nextPoint)) {
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

function entitiesNearSnake(snake) { // Returns entities near snake and loaded entities that are not in radius
    let entitiesInRadius = entitiesWithinRadius({ x: snake.position.x, y: snake.position.y }, Object.values(entities), snake);
    let loadedEntities = Object.values(snake.loadedEntities);
    let entitiesToAdd = entitiesInRadius.filter(entity => !loadedEntities.includes(entity));
    let entitiesToRemove = loadedEntities.filter(entity => !entitiesInRadius.includes(entity));
    return { entitiesToAdd, entitiesToRemove };
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
            
            let entQuery = entitiesNearSnake(snake);
            
            
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
                    let direction = getNormalizedDirection(secondToLastPoint, lastPoint);

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