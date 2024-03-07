const Enums = require("./Enums.js");
const MapFunctions = require("./MapFunctions.js");
const { EntityFunctions, SnakeFunctions } = require("./EntityFunctions.js");
const Food = require("./Food.js");
const AVLTree = require("./AVLTree.js");

leaderboard = new AVLTree();



class Snake {
    network = null;
    nick = "";
    type = Enums.EntityTypes.ENTITY_PLAYER;
    
    constructor(network, name) {
        this.client = network;
        this.network = network.socket;
        this.ip = network.ip;
        this.client.dead = false;
        this.client.sendConfig();
        this.flags |= Enums.EntityFlags.DEBUG
        if (customPlayerColors[name]) {
            this.customHead = customPlayerColors[name].customHead;
            this.customBody = customPlayerColors[name].customBody;
            this.customTail = customPlayerColors[name].customTail;
            this.flags |= Enums.EntityFlags.CUSTOM_COLOR;

        }

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
        this.visualLength = defaultLength;
        this.actualLength = defaultLength;
        this.killedSnakes = [];
        leaderboard.insert(this.length, this.id);



        snakes[this.id] = this;
        entities[this.id] = this;

        
        this.network.send(Bit8);
    }
    get length() {
        return this.actualLength;
    }
    set length(value) {
        
        leaderboard.delete(this.actualLength, this.id);
        this.actualLength = value;
        leaderboard.insert(this.actualLength, this.id);

    }
    
    updateLeaderboard() {
        const BitView = new DataView(new ArrayBuffer(1000));
        let offset = 0;
        BitView.setUint8(offset, Enums.ServerToClient.OPCODE_LEADERBOARD);
        offset += 1;

        let count = 1;
        let myRank = 1;
        for (let pair of leaderboard.reverseOrderTraversal()) {
            let snake = entities[pair.data]
            if (!snake || !snake.spawned)
                continue
            if (snake.id == this.id)
                myRank = count;
            if (count <= 10) {
                if (count == 1)
                    king = snake;
                BitView.setUint16(offset, snake.id, true);
                offset += 2;
                BitView.setUint32(offset, (snake.actualLength - defaultLength) * scoreMultiplier, true);
                offset += 4;
                const nameBytes = new TextEncoder().encode(snake.nick);
                const nameLength = nameBytes.length;
                for (let j = 0; j < nameLength; j++) {
                    BitView.setUint16(offset + j * 2, nameBytes[j], true);
                }
                offset += nameLength * 2;
                BitView.setUint16(offset, 0, true);
                offset += 2;
            }
            count++
        }
        if (myRank) {
            BitView.setUint16(offset, 0, true);
            offset += 2;
            BitView.setUint16(offset, this.id, true);
            offset += 2;
            BitView.setUint32(offset, (this.length - defaultLength) * scoreMultiplier, true);
            offset += 4;
            BitView.setUint16(offset, myRank, true);
            offset += 2;
        }
        this.network.send(BitView);

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
        let goingUp = direction = Enums.Directions.UP || direction == Enums.Directions.RIGHT;
        let secondPoint = this.points[0];
        if (Math.abs(secondPoint[whatVector] - vector) < 0.1) { // Attempting to turn in place
            vector += goingUp ? 0.22 : -0.22;
        } else {
            let dist = Math.abs(this.position[whatVector] - vector);
            if (dist > 5) {
                vector += goingUp ? 0.22 : -0.22;
            }
        }
        this.position[whatVector] = vector;

        

        
        

        if (secondPoint)
            Object.values(clients).forEach((client) => {
                if (!client.snake)
                    return
                let snake = client.snake;
                if (this.client.loadedEntities[snake.id]) {
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
                            
                            if (MapFunctions.DoIntersect(this.position, secondPoint, point, nextPoint)) {
                                /*this.DrawDebugCircle(this.position.x, this.position.y, 50, 4); // Yellow
                                this.DrawDebugCircle(secondPoint.x, secondPoint.y, 50, 4); // Yellow
                                this.DrawDebugCircle(point.x, point.y, 100, 3); // Green
                                this.DrawDebugCircle(nextPoint.x, nextPoint.y, 100, 3); // Green*/
                                setTimeout(() => { // Make sure they didn't move out of the way
                                    if (MapFunctions.DoIntersect(this.position, secondPoint, point, nextPoint)) {
                                        if (this == snake) {
                                            this.kill(Enums.KillReasons.SELF, this);
                                        } else {
                                            this.kill(Enums.KillReasons.KILLED, snake);
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
    kill(reason, killedBy) {
        if (this.invincible)
            return;
        if (killedBy != this) {
            if (!killedBy)
                return
            //
            killedBy.killstreak += 1;
            if (killedBy.killstreak >= 8) {
                killedBy.flags |= Enums.EntityFlags.KILLSTREAK;
                let oldKillstreak = killedBy.killstreak;
                setTimeout(() => {
                    if (!killedBy)
                        return
                    if (killedBy.killstreak == oldKillstreak)
                        killedBy.flags &= ~Enums.EntityFlags.KILLSTREAK;
                }, 5000)
            }
            if (king && king == this) {
                killedBy.flags |= Enums.EntityFlags.KILLED_KING;
                setTimeout(() => {
                    if (!killedBy)
                        return
                    killedBy.flags &= ~Enums.EntityFlags.KILLED_KING;
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

            offset = global.getString(Bit8, offset).offset;
            killedBy.network.send(Bit8);
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
                characterIndex < killedBy.nick.length;
                characterIndex++
            ) {
                Bit8.setUint16(
                offset + characterIndex * 2,
                killedBy.nick.charCodeAt(characterIndex),
                true
                );
            }
            offset = global.getString(Bit8, offset).offset;
            this.network.send(Bit8);
        }
        // Update other snakes
        
        if (!this.spawned) {
            return
        }
        Object.values(clients).forEach((client) => {
            if (client.loadedEntities[this.id]) {
                var Bit8 = new DataView(new ArrayBuffer(16 + 2 * 1000));
                Bit8.setUint8(0, Enums.ServerToClient.OPCODE_ENTITY_INFO);
                var offset = 1;
            
                Bit8.setUint16(offset, this.id, true);
                offset += 2;
                Bit8.setUint8(offset, Enums.UpdateTypes.UPDATE_TYPE_DELETE, true);
                offset += 1;
                Bit8.setUint16(offset, killedBy.id, true);
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
                client.socket.send(Bit8);
                delete client.loadedEntities[this.id]
            }
        });


        // Convert snake to food
        
        

        let actualLength = 0
        for (let i = -1; i < this.points.length - 1; i++) {
          let point;
          if (i == -1) point = this.position;
          else point = this.points[i];
          let nextPoint = this.points[i + 1];

          let segmentLength = SnakeFunctions.GetSegmentLength(point, nextPoint);
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
                entity.lastUpdate = Date.now();

                if (progress < 1) {
                    // Continue animation until duration is reached
                    setTimeout(() => animate(performance.now()), frameDuration);
                }
            };

            // Start animation
            animate(performance.now());
        }



        let scoreToDrop = SnakeFunctions.GetScoreToDrop(actualLength);
        let foodToDrop = SnakeFunctions.ScoreToFood(scoreToDrop)*foodMultiplier;
        let dropAtInterval = actualLength / (foodToDrop);
        for (let i = 0; i < actualLength; i += dropAtInterval) {
            let point = SnakeFunctions.GetPointAtDistance(this, i);
            let nextPoint
            if (i == actualLength-1)
                nextPoint = this.position;
            else
                nextPoint = SnakeFunctions.GetPointAtDistance(this, i + 1);
            let food = new Food(point.x, point.y, this.color - 25 + Math.random() * 50, this, 20000 + (Math.random() * 60 * 1000 * 5));
            
            // Move food forward the direction that the line was going
            
            let direction = MapFunctions.GetNormalizedDirection(nextPoint, point);

            if (direction) {
                let amountDispersion = 2;
                let speedMultiplier = 2;
                let easingRandomX = (Math.random() * (amountDispersion))-amountDispersion/2;
                easingRandomX += (direction.x * this.speed * UPDATE_EVERY_N_TICKS * speedMultiplier);
                let easingRandomY = (Math.random() * (amountDispersion))-amountDispersion/2;
                easingRandomY += (direction.y * this.speed * UPDATE_EVERY_N_TICKS * speedMultiplier);
                easeOut(food, { x: point.x + easingRandomX, y: point.y + easingRandomY }, 5000);
            }
        }
        
        let entitiesToAdd = []
        let entitiesToRemove = []
        if (killedBy != this) {
            this.client.killedBy = killedBy
            killedBy.killedSnakes.push(this)
            // Sync up the loaded entities
            
            Object.values(killedBy.client.loadedEntities).forEach((entity) => {
                if (entity.id == this.id) {
                    return
                }
                if (!this.client.loadedEntities[entity.id]) {
                    entitiesToAdd.push(entity)
                }
            })
            Object.values(this.client.loadedEntities).forEach((entity) => {
                if (entity.id == killedBy.id) {
                    return
                }
                if (!killedBy.client.loadedEntities[entity.id]) {
                    entitiesToRemove.push(entity)
                }
            })
            this.client.update(Enums.UpdateTypes.UPDATE_TYPE_DELETE, entitiesToRemove);
            this.client.update(Enums.UpdateTypes.UPDATE_TYPE_FULL, entitiesToAdd);

        }
        this.killedSnakes.forEach((snake, index) => {
            if (snake.client.snake || !clients[snake.client.id]) {// If the snake respawned or disconnected, remove it from the list
                delete this.killedSnakes[index]
                return
            }
            snake.client.update(Enums.UpdateTypes.UPDATE_TYPE_DELETE, [entitiesToRemove]);
            snake.client.update(Enums.UpdateTypes.UPDATE_TYPE_FULL, [entitiesToAdd]);
        })
        killedBy.killedSnakes = killedBy.killedSnakes.concat(this.killedSnakes) // Add the snakes that this snake killed to the killer's list
        this.spawned = false;
        this.client.deadPosition = this.position;
        this.client.dead = true;
        this.client.snake = undefined;
        leaderboard.delete(this.actualLength, this.id);
        entityIDs.releaseID(this.id);
        delete snakes[this.id];
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


}

module.exports = Snake;