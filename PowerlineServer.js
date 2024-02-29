const WebSocket = require('ws');
const HttpsServer = require('https').createServer;
const fs = require("fs");
const EventEmitter = require("events");


/* Required */
const IDManager = require("./modules/IDManager.js");
const Enums = require("./modules/Enums.js");
const Food = require("./modules/Food.js");
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
var admins = [
    "73.96.77.58",
    "127.0.0.1",
    "64.112.210.252"
]
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



class Snake {
    network = null;
    nick = "";
    type = Enums.EntityTypes.ENTITY_PLAYER;
    loadedEntities = {};
    
    constructor(network, simulated) {
        this.network = network.socket;
        this.ip = network.ip;
        this.simulated = simulated;
        this.sendConfig();

        if (!this.id) {
          clients[lastClientId] = this;
          lastClientId++;
        }
    }
    windowSizeX = 128;
    windowSizeY = 64;
    sendConfig() {
        var Bit8 = new DataView(new ArrayBuffer(49));
        let cfgType = Enums.ServerToClient.OPCODE_CONFIG;
        let offset = 0;
        Bit8.setUint8(offset, cfgType); // 176 or 160
        offset += 1;
        Bit8.setFloat32(offset, arenaSize, true); //Arena Size
        offset += 4;
        if (cfgType == Enums.ServerToClient.OPCODE_CONFIG_2) {
            Bit8.setFloat32(offset, 0, true); //Minimap Entities X Offset
            offset += 4;
            Bit8.setFloat32(offset, 0, true); //Minimap Entities Y Offset
            offset += 4;
        }
        Bit8.setFloat32(offset, 2, true); //Default zoom
        offset += 4;
        Bit8.setFloat32(offset, 1.5, true); //Minimum zoom
        offset += 4;
        Bit8.setFloat32(offset, 100, true); //Minimum zoom score
        offset += 4;
        Bit8.setFloat32(offset, 10, true); //Zoom Level 2
        offset += 4 + 4;
        Bit8.setFloat32(offset, 90, true); //Input Delay, If 0 then no input delay calculations will take place
        offset += 4;
        Bit8.setFloat32(offset, 60, true); //Not Used
        offset += 4;
        Bit8.setFloat32(offset, 40, true); //Other Snake Delay
        offset += 4;
        Bit8.setFloat32(offset, 1, true); //isTalkEnabled
        this.network.send(Bit8);

        
    }
    spawn(name) {
        let thisId = entityIDs.allocateID();
        console.log("Spawning snake " + name + " with ID " + thisId)
        this.spawned = true;
        var Bit8 = new DataView(new ArrayBuffer(1000));
        Bit8.setUint8(0, Enums.ServerToClient.OPCODE_ENTERED_GAME);
        Bit8.setUint32(1, thisId, true);
        this.id = thisId;
        this.nick = name
        let randomPos = MapFunctions.GetRandomPosition();
        this.position = { x: randomPos.x, y: randomPos.y };
        this.direction = Enums.Directions.UP;
        this.speed = 0.25;
        this.speedBypass = false;
        this.extraSpeed = 0;
        this.killstreak = 0;
        this.points = [{x: this.position.x, y: this.position.y}];
        this.newPoints = [];
        this.talkStamina = 255;
        this.color = Math.random() * 360;
        this.length = defaultLength;



        snakes[this.id] = this;
        entities[this.id] = this;

        
        this.network.send(Bit8);

        
    }
    updateLeaderboard() {
        const sortedSnakes = Object.values(snakes).sort((a, b) => b.length - a.length);
        const totalSnakes = sortedSnakes.length;
        const maxDisplayedSnakes = Math.min(totalSnakes, 10); // Display only the first 10 snakes
        const maxNickLength = Math.max(...sortedSnakes.map(snake => snake.nick.length));

        const calculatedTotalBits = 1 + maxDisplayedSnakes * (2 + 4 + (maxNickLength + 1) * 2) + 2 + 2 + 4 + 2 + 2;
        const Bit8 = new DataView(new ArrayBuffer(calculatedTotalBits));
        let offset = 0;

        Bit8.setUint8(offset, Enums.ServerToClient.OPCODE_LEADERBOARD);
        offset += 1;

        let myRank = 0;

        for (let index = 0; index < totalSnakes; index++) {
            const snake = sortedSnakes[index];
            const snakeId = snake.id;
            if (snakeId == this.id) {
                myRank = index + 1;
            }
            if (index >= maxDisplayedSnakes) {
                if (myRank != 0)
                    break
                else
                    continue
            }
            
            
            const snakeLength = (snake.length - defaultLength) * scoreMultiplier;
            const snakeNick = snake.nick;
            const nameBytes = new TextEncoder().encode(snakeNick);
            const nameLength = nameBytes.length;
            const snakeRank = index + 1;

            if (snakeId === this.id) {
                myRank = snakeRank;
            }

            if (snakeRank === 1) {
                king = snake;
            }

            Bit8.setUint16(offset, snakeId, true);
            offset += 2;
            Bit8.setUint32(offset, snakeLength, true);
            offset += 4;

            for (let j = 0; j < nameLength; j++) {
                Bit8.setUint16(offset + j * 2, nameBytes[j], true);
            }
            offset += nameLength * 2;

            Bit8.setUint16(offset, 0, true);
            offset += 2;
        }

        Bit8.setUint16(offset, 0, true);
        offset += 2;
        Bit8.setUint16(offset, this.id, true);
        offset += 2;
        Bit8.setUint32(offset, (this.length - defaultLength) * scoreMultiplier, true);
        offset += 4;

        Bit8.setUint16(offset, myRank, true);
        offset += 2;

        this.network.send(Bit8);
    }
    addPoint(x, y) {
        this.points.unshift({ x: x, y: y });
        this.newPoints.push({ x: x, y: y });
    }
    turn(direction, vector) {
        let whatVector, oppositeVector;
        if (direction == Enums.Directions.UP || direction == Enums.Directions.DOWN) {
            whatVector = "x";
            oppositeVector = "y";
        } else {
            whatVector = "y";
            oppositeVector = "x";
        }
        if (this.direction == direction || this.direction + 2 == direction || this.direction - 2 == direction) { // If the direction is the same or opposite
            return;
        }
        let goingUp = this.direction = Enums.Directions.UP || this.direction == Enums.Directions.RIGHT;
        if (this.position[whatVector] == vector) { // Attempting to turn in place
            //console.log("Attempting to turn in place")
            if (goingUp) {
                this.position[whatVector] += 0.1;
            }
            else {
                this.position[whatVector] -= 0.1;
            }
        } else {
            let dist = Math.abs(this.position[whatVector] - vector);
            if (dist > 5) {
                //console.log("Attempting to turn "+dist+" units away")
                
                let goingUp = this.direction = Enums.Directions.UP || this.direction == Enums.Directions.RIGHT;
                if (goingUp) {
                    this.position[whatVector] += 0.1;
                }
                else {
                    this.position[whatVector] -= 0.1;
                }
            } else
                this.position[whatVector] = vector;

        }

        

        let secondPoint = this.points[0];
        

        if (secondPoint)
            Object.values(clients).forEach((snake) => {
                if (this.loadedEntities[snake.id]) {
                    for (let i = -1; i < snake.points.length - 1; i++) {
                        let point;
                        if (i == -1)
                            point = snake.position;
                        else
                            point = snake.points[i];
                        let nextPoint = snake.points[i + 1];
                        
                        // Make sure that the last point did not intersect with another snake
                        if (this.position != nextPoint && secondPoint != point && secondPoint != nextPoint &&
                            this.position != secondPoint && this.position != point) {
                            
                            if (doIntersect(this.position, secondPoint, point, nextPoint)) {
                                /*this.DrawDebugCircle(this.position.x, this.position.y, 50, 4); // Yellow
                                this.DrawDebugCircle(secondPoint.x, secondPoint.y, 50, 4); // Yellow
                                this.DrawDebugCircle(point.x, point.y, 100, 3); // Green
                                this.DrawDebugCircle(nextPoint.x, nextPoint.y, 100, 3); // Green*/
                                setTimeout(() => { // Make sure they didn't move out of the way
                                    if (doIntersect(this.position, secondPoint, point, nextPoint)) {
                                        if (this == snake) {
                                            this.kill(Enums.KillReasons.SELF, this.id);
                                        } else {
                                            this.kill(Enums.KillReasons.KILLED, snake.id);
                                        }
                                    }
                                }, snake.ping || 50)
                            }
                        }
                    }
                }
        })
        
            


        
        this.direction = direction;
        this.addPoint(this.position.x, this.position.y);
    }
    rubAgainst(snake, distance) {
        this.flags |= Enums.EntityFlags.IS_RUBBING;
        this.speeding = true
        this.RubSnake = snake.id;

        let rubSpeed = 4/distance
        if (rubSpeed > 4)
            rubSpeed = 4
        if (this.extraSpeed + rubSpeed <= maxRubSpeed || this.speedBypass) {
            this.extraSpeed += rubSpeed
            this.speed = 0.25 + this.extraSpeed / (255 * UPDATE_EVERY_N_TICKS);
        }
        
    }
    stopRubbing() {
        this.flags &= ~Enums.EntityFlags.IS_RUBBING;
        this.speeding = false
    }
    kill(reason, killedByID) {
        if (this.invincible)
            return;
        if (killedByID != this.id) {
            if (!snakes[killedByID])
                return
            //
            snakes[killedByID].killstreak += 1;
            if (snakes[killedByID].killstreak >= 8) {
                snakes[killedByID].flags |= Enums.EntityFlags.KILLSTREAK;
                let oldKillstreak = snakes[killedByID].killstreak;
                setTimeout(() => {
                    if (!snakes[killedByID])
                        return
                    if (snakes[killedByID].killstreak == oldKillstreak)
                        snakes[killedByID].flags &= ~Enums.EntityFlags.KILLSTREAK;
                }, 5000)
            }
            if (king && king == this) {
                snakes[killedByID].flags |= Enums.EntityFlags.KILLED_KING;
                setTimeout(() => {
                    if (!snakes[killedByID])
                        return
                    snakes[killedByID].flags &= ~Enums.EntityFlags.KILLED_KING;
                }, 5000)
            }

            // Send "Killed"
            var Bit8 = new DataView(new ArrayBuffer(16 + 2 * 1000));
            Bit8.setUint8(0, Enums.ServerToClient.OPCODE_EVENTS);
            var offset = 1;
            Bit8.setUint8(offset, Enums.EventCodes.EVENT_DID_KILL, true);
            offset += 1;
            Bit8.setUint16(offset, 0, true); //(ID?), unused.
            offset += 2;
            for (
              var characterIndex = 0;
              characterIndex < this.nick.length;
              characterIndex++
            ) {
              Bit8.setUint16(
                offset + characterIndex * 2,
                this.nick.charCodeAt(characterIndex),
                true
              );
            }

            offset = getString(Bit8, offset).offset;
            snakes[killedByID].network.send(Bit8);
            // Send "Killed By"
            var Bit8 = new DataView(new ArrayBuffer(16 + 2 * 1000));
            Bit8.setUint8(0, Enums.ServerToClient.OPCODE_EVENTS);
            var offset = 1;
            Bit8.setUint8(offset, Enums.EventCodes.EVENT_WAS_KILLED, true);
            offset += 1;
            Bit8.setUint16(offset, 0, true); //(ID?), unused.
            offset += 2;
            for (
                var characterIndex = 0;
                characterIndex < snakes[killedByID].nick.length;
                characterIndex++
            ) {
                Bit8.setUint16(
                offset + characterIndex * 2,
                snakes[killedByID].nick.charCodeAt(characterIndex),
                true
                );
            }
            offset = getString(Bit8, offset).offset;
            this.network.send(Bit8);
        }
        // Update other snakes
        
        if (!this.spawned) {
            return
        }
        Object.values(clients).forEach((snake) => {
            if (snake.loadedEntities[this.id]) {
                var Bit8 = new DataView(new ArrayBuffer(16 + 2 * 1000));
                Bit8.setUint8(0, Enums.ServerToClient.OPCODE_ENTITY_INFO);
                var offset = 1;
            
                Bit8.setUint16(offset, this.id, true);
                offset += 2;
                Bit8.setUint8(offset, Enums.UpdateTypes.UPDATE_TYPE_DELETE, true);
                offset += 1;
                Bit8.setUint16(offset, killedByID, true);
                offset += 2;
                Bit8.setUint8(offset, reason);
                offset += 1;
                Bit8.setFloat32(offset, this.position.x, true); //Kill position X
                offset += 4;
                Bit8.setFloat32(offset, this.position.y, true); //Kill position Y
                offset += 4;

                // King
                Bit8.setUint16(offset, 0, true);
                offset += 2;
                Bit8.setUint16(offset, king && king.id || 0, true);
                offset += 2;
                Bit8.setFloat32(offset, king && king.position.x || 0, true);
                offset += 4;
                Bit8.setFloat32(offset, king && king.position.y || 0, true);
                offset += 4;
                snake.network.send(Bit8);
                delete snake.loadedEntities[this.id]
            }
        });


        // Convert snake to food
        
        

        let actualLength = 0
        for (let i = -1; i < this.points.length - 1; i++) {
          let point;
          if (i == -1) point = this.position;
          else point = this.points[i];
          let nextPoint = this.points[i + 1];

          let segmentLength = getSegmentLength(point, nextPoint);
          actualLength += segmentLength;
        }

        function customEasing(t) {
            // Adjust the value of a for the desired effect
            const a = 8; // Controls the rate of slowing down

            // Apply easing equation
            return 1 - Math.exp(-a * t);
        }

        function easeOut(entity, targetPosition, duration) {
            const startX = entity.position.x;
            const startY = entity.position.y;
            const deltaX = targetPosition.x - startX;
            const deltaY = targetPosition.y - startY;

            const fps = 60; // frames per second
            const frameDuration = 1000 / fps;

            let startTime = null;

            const animate = (timestamp) => {
                if (!entity || !entity.position) return;
                if (!startTime) startTime = timestamp;
                const elapsed = timestamp - startTime;
                const progress = Math.min(elapsed / duration, 1); // Ensure progress doesn't exceed 1

                // Apply custom easing function to progress
                const easedProgress = customEasing(progress);

                // Calculate eased position
                entity.position.x = startX + deltaX * easedProgress;
                entity.position.y = startY + deltaY * easedProgress;

                if (progress < 1) {
                    // Continue animation until duration is reached
                    setTimeout(() => animate(performance.now()), frameDuration);
                }
            };

            // Start animation
            animate(performance.now());
        }



        let scoreToDrop = getScoreToDrop(actualLength);
        let foodToDrop = scoreToFood(scoreToDrop)*foodMultiplier;
        let dropAtInterval = actualLength / (foodToDrop);
        for (let i = 0; i < actualLength; i += dropAtInterval) {
            let point = getPointAtDistance(this, i);
            let nextPoint
            if (i == actualLength-1)
                nextPoint = this.position;
            else
                nextPoint = getPointAtDistance(this, i + 1);
            let food = new Food(point.x, point.y, this.color - 25 + Math.random() * 50, this, 20000 + (Math.random() * 60 * 1000 * 5));
            
            // Move food forward the direction that the line was going
            
            let direction = getNormalizedDirection(nextPoint, point);

            if (direction) {
                let amountDispersion = 2;
                let speedMultiplier = 2;
                let easingRandomX = Math.random() * (amountDispersion - (amountDispersion / 2));
                easingRandomX += (direction.x * this.speed * UPDATE_EVERY_N_TICKS * speedMultiplier);
                let easingRandomY = Math.random() * (amountDispersion - (amountDispersion / 2));
                easingRandomY += (direction.y * this.speed * UPDATE_EVERY_N_TICKS * speedMultiplier);
                easeOut(food, { x: point.x + easingRandomX, y: point.y + easingRandomY }, 5000);
            }
        }
        
        


        this.spawned = false;
        delete snakes[this.id];
        entityIDs.releaseID(this.id);
        delete entities[this.id]

    }
    doPong() {
        this.pingStart = Date.now();
        var Bit8 = new DataView(new ArrayBuffer(3));
        Bit8.setUint8(0, Enums.ServerToClient.OPCODE_SC_PING);
        Bit8.setUint16(1, this.ping || 0, true);
        this.network.send(Bit8);
    }
    doPing() {
        var Bit8 = new DataView(new ArrayBuffer(1));
        Bit8.setUint8(0, Enums.ServerToClient.OPCODE_SC_PONG);
        this.network.send(Bit8);
    }
    update(updateType, entities) {
        /* CALCULATING TOTAL BITS */
        var calculatedTotalBits = 1;
        Object.values(entities).forEach((entity) => {
            if (
                entity.position && entity.spawned &&
                (((updateType == Enums.UpdateTypes.UPDATE_TYPE_PARTIAL || updateType == Enums.UpdateTypes.UPDATE_TYPE_DELETE) && this.loadedEntities[entity.id]) || updateType == Enums.UpdateTypes.UPDATE_TYPE_FULL) // Make sure that entity is rendered before making updates
            ) {
                calculatedTotalBits += 2 + 1;
                switch (updateType) {
                    case Enums.UpdateTypes.UPDATE_TYPE_PARTIAL:
                        switch (entity.type) {
                            case Enums.EntityTypes.ENTITY_PLAYER:
                                calculatedTotalBits += 4 + 4 + 4 + 4 + 1 + 2 + 1;
                                
                                if (entity.flags & Enums.EntityFlags.DEBUG) {
                                    calculatedTotalBits += 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 2;
                                }
                                if (entity.flags & Enums.EntityFlags.IS_RUBBING) {
                                    calculatedTotalBits += 4 + 4 + 2;
                                }
                                if (entity.flags & Enums.EntityFlags.IS_BOOSTING) { }
                                if (entity.flags & Enums.EntityFlags.PING) {
                                    calculatedTotalBits += 2;
                                }
                                if (entity.flags & Enums.EntityFlags.KILLED_KING) { }
                                if (entity.flags & Enums.EntityFlags.KILLSTREAK) {
                                    calculatedTotalBits += 2;
                                }
                                if (entity.flags & Enums.EntityFlags.SHOW_TALKING) {
                                    calculatedTotalBits += 1;
                                }
                                calculatedTotalBits += 1 + 1 + 1 + (4 + 4) * (entity.newPoints.length);
                                break;
                            case Enums.EntityTypes.ENTITY_ITEM:
                                calculatedTotalBits += 4 + 4;
                                break;
                        }
                        break
                    case Enums.UpdateTypes.UPDATE_TYPE_FULL:
                        calculatedTotalBits += 1 + 1
                        if (entity.type == Enums.EntityTypes.ENTITY_PLAYER)
                            calculatedTotalBits += (1 + entity.nick.length) * 2;
                        else
                            calculatedTotalBits += 2;
                        
                        switch (entity.type) {
                            case Enums.EntityTypes.ENTITY_PLAYER:
                                calculatedTotalBits += 4 + 4 + 4 + 4 + 1 + 2 + 1;
                                if (entity.flags & Enums.EntityFlags.DEBUG) {
                                    calculatedTotalBits += 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 2;
                                }
                                if (entity.flags & Enums.EntityFlags.IS_RUBBING) {
                                    calculatedTotalBits += 4 + 4 + 2;
                                }
                                if (entity.flags & Enums.EntityFlags.IS_BOOSTING) { }
                                if (entity.flags & Enums.EntityFlags.PING) {
                                    calculatedTotalBits += 2;
                                }
                                if (entity.flags & Enums.EntityFlags.KILLED_KING) { }
                                if (entity.flags & Enums.EntityFlags.KILLSTREAK) {
                                    calculatedTotalBits += 2;
                                }
                                if (entity.flags & Enums.EntityFlags.SHOW_TALKING) {
                                    calculatedTotalBits += 1;
                                }
                                
                                calculatedTotalBits += 1 + 1
                                calculatedTotalBits += (4 + 4) * entity.points.length;
                                calculatedTotalBits += 2 + 1;
                                break
                            case Enums.EntityTypes.ENTITY_ITEM:
                                calculatedTotalBits += 4 + 4 + 2;
                                break
                        }
                        break
                    case Enums.UpdateTypes.UPDATE_TYPE_DELETE:
                        calculatedTotalBits += 2 + 1
                        
                        switch (entity.type) {
                            case Enums.EntityTypes.ENTITY_PLAYER:
                                calculatedTotalBits += 4 + 4;
                                break
                            case Enums.EntityTypes.ENTITY_ITEM:

                                break
                        }
                        break
                }
            }
        })
        calculatedTotalBits += 2 + 2 + 4 + 4; // King bits
        var Bit8 = new DataView(new ArrayBuffer(calculatedTotalBits));
        Bit8.setUint8(0, Enums.ServerToClient.OPCODE_ENTITY_INFO);
        var offset = 1;
        

        Object.values(entities).forEach((entity) => {
            if (
                entity.position && entity.spawned &&
                (((updateType == Enums.UpdateTypes.UPDATE_TYPE_PARTIAL || updateType == Enums.UpdateTypes.UPDATE_TYPE_DELETE) && this.loadedEntities[entity.id]) || updateType == Enums.UpdateTypes.UPDATE_TYPE_FULL) // Make sure that entity is rendered before making updates
            ) {
                Bit8.setUint16(offset, entity.id, true);
                offset += 2;
                Bit8.setUint8(offset, updateType, true);
                offset += 1;
                switch (updateType) {
                    case Enums.UpdateTypes.UPDATE_TYPE_PARTIAL:
                        switch (entity.type) {
                            case Enums.EntityTypes.ENTITY_PLAYER:
                                Bit8.setFloat32(offset, entity.position.x, true);
                                offset += 4;
                                Bit8.setFloat32(offset, entity.position.y, true);
                                offset += 4;
                                Bit8.setFloat32(offset, entity.speed, true);
                                offset += 4;
                                Bit8.setFloat32(offset, entity.length, true);
                                offset += 4;
                                offset += 1;
                                Bit8.setUint16(offset, entity.points.length, true);
                                offset += 2;
                                Bit8.setUint8(offset, entity.flags, true);
                                offset += 1;
                                if (entity.flags & Enums.EntityFlags.DEBUG) {
                                    Bit8.setFloat32(offset, 0, true);
                                    offset += 4;
                                    Bit8.setFloat32(offset, 0, true);
                                    offset += 4;
                                    Bit8.setFloat32(offset, 0, true);
                                    offset += 4;
                                    Bit8.setFloat32(offset, 0, true);
                                    offset += 4;

                                    Bit8.setFloat32(offset, 0, true);
                                    offset += 4;
                                    Bit8.setFloat32(offset, 0, true);
                                    offset += 4;
                                    Bit8.setFloat32(offset, 0, true);
                                    offset += 4;
                                    Bit8.setFloat32(offset, 0, true);
                                    offset += 4;

                                    Bit8.setUint16(offset, 0, true);

                                    offset += 2;
                                }
                                if (entity.flags & Enums.EntityFlags.IS_RUBBING) {
                                    Bit8.setFloat32(offset, entity.rubX, true);
                                    offset += 4;
                                    Bit8.setFloat32(offset, entity.rubY, true);
                                    offset += 4;
                                    Bit8.setUint16(offset, entity.RubSnake, true);
                                    offset += 2;
                                }
                                if (entity.flags & Enums.EntityFlags.IS_BOOSTING) { }
                                if (entity.flags & Enums.EntityFlags.PING) {
                                    Bit8.setUint16(offset, entity.ping || 0, true);
                                    offset += 2;
                                }
                                if (entity.flags & Enums.EntityFlags.KILLED_KING) { }
                                if (entity.flags & Enums.EntityFlags.KILLSTREAK) {
                                    Bit8.setUint16(offset, entity.killstreak, true);
                                    offset += 2;
                                }
                                if (entity.flags & Enums.EntityFlags.SHOW_TALKING) {
                                    Bit8.setUint8(offset, entity.talkId, true);
                                    offset += 1;
                                }
                                
                                Bit8.setUint8(offset, entity.talkStamina, true);
                                offset += 1;
                                Bit8.setUint8(offset, entity.extraSpeed, true);
                                offset += 1;
                                let newPointsLength = entity.newPoints.length
                                Bit8.setUint8(offset, newPointsLength, true);
                                offset += 1;
                                for (let i = newPointsLength - 1; i >= 0; i--) {
                                    let point = entity.newPoints[i];
                                    Bit8.setFloat32(offset, point.x, true);
                                    offset += 4;
                                    Bit8.setFloat32(offset, point.y, true);
                                    offset += 4;
                                }
                                break;
                            case Enums.EntityTypes.ENTITY_ITEM:
                                Bit8.setFloat32(offset, entity.position.x, true);
                                offset += 4;
                                Bit8.setFloat32(offset, entity.position.y, true);
                                offset += 4;
                                break;
                        }
                        break
                    case Enums.UpdateTypes.UPDATE_TYPE_FULL:
                        Bit8.setUint8(offset, entity.type, true);
                        offset += 1;
                        Bit8.setUint8(offset, entity.subtype || 0, true);
                        offset += 1;
                        if (entity.type == Enums.EntityTypes.ENTITY_PLAYER) {
                            for (var characterIndex = 0; characterIndex < entity.nick.length; characterIndex++) {
                                Bit8.setUint16(offset + characterIndex * 2, entity.nick.charCodeAt(characterIndex), true);
                            }
                            offset += (1 + entity.nick.length) * 2;
                        } else {
                            Bit8.setUint16(offset, 0, true);
                            offset += 2;
                        }
                        
                        switch (entity.type) {
                            case Enums.EntityTypes.ENTITY_PLAYER:
                                Bit8.setFloat32(offset, entity.position.x, true);
                                offset += 4;
                                Bit8.setFloat32(offset, entity.position.y, true);
                                offset += 4;
                                Bit8.setFloat32(offset, entity.speed, true);
                                offset += 4;
                                Bit8.setFloat32(offset, entity.length, true);
                                offset += 4;
                                offset += 1;
                                Bit8.setUint16(offset, entity.points.length, true);
                                offset += 2;
                                Bit8.setUint8(offset, entity.flags, true);
                                offset += 1;
                                if (entity.flags & Enums.EntityFlags.DEBUG) {
                                    Bit8.setFloat32(offset, 0, true);
                                    offset += 4;
                                    Bit8.setFloat32(offset, 0, true);
                                    offset += 4;
                                    Bit8.setFloat32(offset, 0, true);
                                    offset += 4;
                                    Bit8.setFloat32(offset, 0, true);
                                    offset += 4;

                                    Bit8.setFloat32(offset, 0, true);
                                    offset += 4;
                                    Bit8.setFloat32(offset, 0, true);
                                    offset += 4;
                                    Bit8.setFloat32(offset, 0, true);
                                    offset += 4;
                                    Bit8.setFloat32(offset, 0, true);
                                    offset += 4;

                                    Bit8.setUint16(offset, 0, true);

                                    offset += 2;
                                }
                                if (entity.flags & Enums.EntityFlags.IS_RUBBING) {
                                    Bit8.setFloat32(offset, entity.rubX, true);
                                    offset += 4;
                                    Bit8.setFloat32(offset, entity.rubY, true);
                                    offset += 4;
                                    Bit8.setUint16(offset, entity.RubSnake, true);
                                    offset += 2;
                                }
                                if (entity.flags & Enums.EntityFlags.IS_BOOSTING) { }
                                if (entity.flags & Enums.EntityFlags.PING) {
                                    Bit8.setUint16(offset, entity.ping || 0, true);
                                    offset += 2;
                                }
                                if (entity.flags & Enums.EntityFlags.KILLED_KING) { }
                                if (entity.flags & Enums.EntityFlags.KILLSTREAK) {
                                    Bit8.setUint16(offset, entity.killstreak, true);
                                    offset += 2;
                                }
                                if (entity.flags & Enums.EntityFlags.SHOW_TALKING) {
                                    Bit8.setUint8(offset, entity.talkId, true);
                                    offset += 1;
                                }
                                Bit8.setUint8(offset, entity.talkStamina, true);
                                offset += 1;
                                Bit8.setUint8(offset, entity.extraSpeed, true);
                                offset += 1;
                                for (let i = 0; i < entity.points.length; i++) {
                                    let point = entity.points[i];
                                    Bit8.setFloat32(offset, point.x, true);
                                    offset += 4;
                                    Bit8.setFloat32(offset, point.y, true);
                                    offset += 4;
                                }
                                Bit8.setUint16(offset, entity.color, true);
                                offset += 2;
                                Bit8.setUint8(offset, 0, true);
                                offset += 1;
                                break;
                            case Enums.EntityTypes.ENTITY_ITEM:
                                Bit8.setFloat32(offset, entity.position.x, true);
                                offset += 4;
                                
                                Bit8.setFloat32(offset, entity.position.y, true);
                                offset += 4;
                                Bit8.setUint16(offset, entity.color, true);
                                offset += 2;
                                break;

                        }
                        this.loadedEntities[entity.id] = entity;

                        break;
                    case Enums.UpdateTypes.UPDATE_TYPE_DELETE:
                        Bit8.setUint16(offset, 0, true); // Set to 0 to disable sounds
                        offset += 2;
                        Bit8.setUint8(offset, Enums.KillReasons.LEFT_SCREEN, true);
                        offset += 1;
                        delete this.loadedEntities[entity.id]
                        switch (entity.type) {
                            case Enums.EntityTypes.ENTITY_PLAYER:
                                Bit8.setFloat32(offset, entity.position.x, true);
                                offset += 4;
                                Bit8.setFloat32(offset, entity.position.y, true);
                                offset += 4;
                                break
                            case Enums.EntityTypes.ENTITY_ITEM:
                                break
                        }
                        break;
                }
            }
        })
        Bit8.setUint16(offset, 0, true);
        offset += 2;
        Bit8.setUint16(offset, king && king.id || 0, true);
        offset += 2;
        Bit8.setFloat32(offset, king && king.position.x || 0, true);
        offset += 4;
        Bit8.setFloat32(offset, king && king.position.y || 0, true);
        offset += 4;
      this.network.send(Bit8);
    }
    numDebugCircle = 0
    DrawDebugCircle(x, y, color = 100, size = 4) {
        this.numDebugCircle++
        let id = this.numDebugCircle;
        var Bit8 = new DataView(new ArrayBuffer(49));
        var offset = 0;
        Bit8.setUint8(offset, 0xa7);
        offset += 1;
        Bit8.setUint16(offset, id, true);
        offset += 2;
        Bit8.setUint8(offset, 1, true);
        offset += 1;
        Bit8.setFloat32(offset, x, true);
        offset += 4;
        Bit8.setFloat32(offset, y, true);
        offset += 4;
        Bit8.setUint16(offset, color, true);
        offset += 2;
        Bit8.setUint8(offset, size, true);
        this.network.send(Bit8);
        return id
    }
    DeleteDebugCircle(circle) {
        var Bit8 = new DataView(new ArrayBuffer(49));
        var offset = 0;
        Bit8.setUint8(offset, 0xa7);
        offset += 1;
        Bit8.setUint8(offset, circle, true);
        offset += 1;
        Bit8.setUint16(offset, 0, true);
    }
    Talk(id) {
        this.flags |= Enums.EntityFlags.SHOW_TALKING;
        this.talkId = id;
        let oldTalkId = id;
        setTimeout(() => {
            if (this.talkId == oldTalkId)
                this.flags &= ~Enums.EntityFlags.SHOW_TALKING;
        }, 5000)

    }
    RecieveMessage(messageType, view) {
        if (messageType != Enums.ClientToServer.OPCODE_ENTER_GAME && !this.id) {
            return
        }
        switch (messageType) {
            case Enums.ClientToServer.OPCODE_CS_PING:
                this.doPong();
                this.doPing();
                break;
            case Enums.ClientToServer.OPCODE_ENTER_GAME:
                var nick = getString(view, 1);
                console.log("Spawning snake " + nick.string);
                if (!this.spawned)
                    this.spawn(nick.string);
                break;
            case Enums.ClientToServer.OPCODE_INPUT_POINT:
                let offset = 1;
                let direction = view.getUint8(offset, true);
                offset += 1;
                let vector = view.getFloat32(offset, true);
                offset += 4;
                let isFocused = view.getUint8(offset, true) & 1;
                this.turn(direction, vector);
                break;
            case Enums.ClientToServer.OPCODE_TALK:
                if (this.talkStamina >= 255) {
                    this.Talk(view.getUint8(1, true));
                    this.talkStamina = 0;
                }
                break;
            case Enums.ClientToServer.OPCODE_AREA_UPDATE:
                this.windowSizeX = view.getUint16(1, true)/2;
                this.windowSizeY = view.getUint16(3, true)/2;
                break;
            case Enums.ClientToServer.OPCODE_HELLO_V4:
                this.windowSizeX = view.getUint16(1, true)/2;
                this.windowSizeY = view.getUint16(3, true)/2;
            case Enums.ClientToServer.OPCODE_HELLO_DEBUG:
                this.windowSizeX = view.getUint16(1, true)/2;
                this.windowSizeY = view.getUint16(3, true) / 2;
            case Enums.ClientToServer.OPCODE_BOOST:
                if (admins.includes(this.ip)) {
                    let boosting = view.getUint8(1) == 1
                    if (boosting) {
                        this.extraSpeed += 2;
                        if (this.extraSpeed > maxBoostSpeed)
                            this.speedBypass = true
                        this.speed = 0.25 + this.extraSpeed / (255 * UPDATE_EVERY_N_TICKS);
                    } else {
                        this.speedBypass = false;
                        if (this.extraSpeed > maxBoostSpeed)
                            this.extraSpeed = maxBoostSpeed
                    }
                }
                break;
            case Enums.ClientToServer.OPCODE_DEBUG_GRAB:
                if (admins.includes(this.ip))
                    this.length += scoreToLength(1000);
                break;
            case 0x0d: // Invincible
                if (admins.includes(this.ip))
                    this.invincible = view.getUint8(1, true) == 1;
            
                break;
            case 0x0e: // Commands
                if (admins.includes(this.ip)) {
                    let command = getString(view, 1).string;
                    if (!command)
                        return
                    command = command.toLowerCase()
                    let commandArgs = command.split(" ");
                    if (!commandArgs[0])
                        return
                    switch (commandArgs[0]) {
                        case "arenasize":
                            if (commandArgs[1]) {
                                let size = parseInt(commandArgs[1]);
                                if (size) {
                                    arenaSize = size;
                                    Object.values(clients).forEach((client) => {
                                        client.sendConfig()
                                    })
                                }
                            }
                            break;
                        case "maxboostspeed":
                            if (commandArgs[1]) {
                                let speed = parseInt(commandArgs[1]);
                                if (speed) {
                                    maxBoostSpeed = speed;
                                }
                            }
                            break;
                        case "maxrubspeed":
                            if (commandArgs[1]) {
                                let speed = parseInt(commandArgs[1]);
                                if (speed) {
                                    maxRubSpeed = speed;
                                }
                            }
                            break;
                        case "updateduration":
                            if (commandArgs[1]) {
                                let duration = parseInt(commandArgs[1]);
                                if (duration) {
                                    updateDuration = duration;
                                }
                            }
                            break;
                        case "maxfood":
                            if (commandArgs[1]) {
                                let max = parseInt(commandArgs[1]);
                                if (max) {
                                    maxFood = max;
                                }
                            }
                            break;
                        case "foodspawnpercent":
                            if (commandArgs[1]) {
                                let rate = parseInt(commandArgs[1]);
                                if (rate) {
                                    foodSpawnPercent = rate;
                                }
                            }
                            break;
                        case "defaultlength":
                            if (commandArgs[1]) {
                                let length = parseInt(commandArgs[1]);
                                if (length) {
                                    defaultLength = length;
                                }
                            }
                            break;
                        case "randomfood":
                            if (commandArgs[1]) {
                                let num = parseInt(commandArgs[1]);
                                if (num) {
                                    for (let i = 0; i < num; i++) {
                                        new Food();
                                    }
                                }
                            }
                            break;
                        case "clearfood":
                            Object.values(entities).forEach((entity) => {
                                if (entity.type == Enums.EntityTypes.ENTITY_ITEM)
                                    entity.eat();
                            })
                            break;
                        case "foodmultiplier":
                            if (commandArgs[1]) {
                                let multiplier = parseInt(commandArgs[1]);
                                if (multiplier) {
                                    foodMultiplier = multiplier;
                                }
                            }
                            break;
                        case "foodvalue":
                            if (commandArgs[1]) {
                                let value = parseInt(commandArgs[1]);
                                if (value) {
                                    foodValue = value;
                                    Object.values(entities).forEach((entity) => {
                                        if (entity.type == Enums.EntityTypes.ENTITY_ITEM)
                                            entity.value = foodValue;

                                    })
                                }
                            }
                            break;

                    }
                }
                break;

        }
    }

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




function getString(data, bitOffset) {
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