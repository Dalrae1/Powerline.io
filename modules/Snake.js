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
    loadedEntities = {};
    
    constructor(network, name) {
        this.client = network;
        this.network = network.socket;
        this.ip = network.ip;
        this.sendConfig();
        //this.flags |= Enums.EntityFlags.DEBUG
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
        this._length = defaultLength;
        this.actualLength = defaultLength;
        leaderboard.insert(this.length, this.id);



        snakes[this.id] = this;
        entities[this.id] = this;

        
        this.network.send(Bit8);
    }
    get length() {
        return this._length;
    }
    set length(value) {
        
        leaderboard.delete(this.actualLength, this.id);
        this.actualLength = value;
        leaderboard.insert(this.actualLength, this.id);

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
        let goingUp = this.direction = Enums.Directions.UP || this.direction == Enums.Directions.RIGHT;
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
            if (!client.snake)
                return
            let snake = client.snake;
            if (snake.loadedEntities[this.id]) {
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
                let easingRandomX = Math.random() * (amountDispersion - (amountDispersion / 2));
                easingRandomX += (direction.x * this.speed * UPDATE_EVERY_N_TICKS * speedMultiplier);
                let easingRandomY = Math.random() * (amountDispersion - (amountDispersion / 2));
                easingRandomY += (direction.y * this.speed * UPDATE_EVERY_N_TICKS * speedMultiplier);
                easeOut(food, { x: point.x + easingRandomX, y: point.y + easingRandomY }, 5000);
            }
        }
        
        

        this.spawned = false;
        this.client.killedBy = killedBy
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
                                calculatedTotalBits += 2 // For 16b flags
                                if (entity.flags & Enums.EntityFlags.DEBUG) {
                                    calculatedTotalBits += 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 2;
                                    calculatedTotalBits += this.points.length*8
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
                                if (entity.flags & Enums.EntityFlags.SHOW_CUSTOM_TALKING) {
                                    calculatedTotalBits += (entity.customTalk.length) * 2;
                                    calculatedTotalBits += 2
                                }
                                if (entity.flags & Enums.EntityFlags.CUSTOM_COLOR) {
                                    calculatedTotalBits += (1 + entity.customHead.length) * 2;
                                    calculatedTotalBits += (1 + entity.customBody.length) * 2;
                                    calculatedTotalBits += (1 + entity.customTail.length) * 2;
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
                                calculatedTotalBits += 2 // For 16b flags
                                if (entity.flags & Enums.EntityFlags.DEBUG) {
                                    calculatedTotalBits += 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 2;
                                    calculatedTotalBits += this.points.length*8
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
                                if (entity.flags & Enums.EntityFlags.SHOW_CUSTOM_TALKING) {
                                    calculatedTotalBits += entity.customTalk.length * 2;
                                    calculatedTotalBits += 2
                                }
                                if (entity.flags & Enums.EntityFlags.CUSTOM_COLOR) {
                                    calculatedTotalBits += (1 + entity.customHead.length) * 2;
                                    calculatedTotalBits += (1 + entity.customBody.length) * 2;
                                    calculatedTotalBits += (1 + entity.customTail.length) * 2;
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
                                let is16Bit = 0
                                is16Bit |= 0x80;
                                Bit8.setUint8(offset, is16Bit, true);
                                offset += 1;
                                Bit8.setUint16(offset, entity.flags, true);
                                offset += 2;
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

                                    Bit8.setUint16(offset, this.points.length, true);
                                    offset += 2;
                                    for (let i = 0; i < this.points.length; i++) {
                                        Bit8.setFloat32(offset, this.points[i].x, true);
                                        offset += 4;
                                        Bit8.setFloat32(offset, this.points[i].y, true);
                                        offset += 4;
                                    }
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
                                if (entity.flags & Enums.EntityFlags.SHOW_CUSTOM_TALKING) {
                                    for (let i = 0; i < entity.customTalk.length; i++) {
                                        Bit8.setUint16(offset, entity.customTalk.charCodeAt(i), true);
                                        offset += 2;
                                    }
                                    offset += 2 // Write 2 bits of null
                                }
                                if (entity.flags & Enums.EntityFlags.CUSTOM_COLOR) {
                                    for (var characterIndex = 0; characterIndex < entity.customHead.length; characterIndex++) {
                                        Bit8.setUint16(offset + characterIndex * 2, entity.customHead.charCodeAt(characterIndex), true);
                                    }
                                    offset += (1 + entity.customHead.length) * 2;

                                    for (var characterIndex = 0; characterIndex < entity.customBody.length; characterIndex++) {
                                        Bit8.setUint16(offset + characterIndex * 2, entity.customBody.charCodeAt(characterIndex), true);
                                    }
                                    offset += (1 + entity.customBody.length) * 2;

                                    for (var characterIndex = 0; characterIndex < entity.customTail.length; characterIndex++) {
                                        Bit8.setUint16(offset + characterIndex * 2, entity.customTail.charCodeAt(characterIndex), true);
                                    }
                                    offset += (1 + entity.customTail.length) * 2;
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
                                let is16Bit = 0
                                is16Bit |= 0x80;
                                Bit8.setUint8(offset, is16Bit, true);
                                offset += 1;
                                Bit8.setUint16(offset, entity.flags, true);
                                offset += 2;
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

                                    Bit8.setUint16(offset, this.points.length, true);
                                    offset += 2;
                                    for (let i = 0; i < this.points.length; i++) {
                                        Bit8.setFloat32(offset, this.points[i].x, true);
                                        offset += 4;
                                        Bit8.setFloat32(offset, this.points[i].y, true);
                                        offset += 4;
                                    }
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
                                if (entity.flags & Enums.EntityFlags.SHOW_CUSTOM_TALKING) {
                                    for (let i = 0; i < entity.customTalk.length; i++) {
                                        Bit8.setUint16(offset, entity.customTalk.charCodeAt(i), true);
                                        offset += 2;
                                    }
                                    offset += 2 // Write 2 bits of null
                                }
                                if (entity.flags & Enums.EntityFlags.CUSTOM_COLOR) {
                                    for (var characterIndex = 0; characterIndex < entity.customHead.length; characterIndex++) {
                                        Bit8.setUint16(offset + characterIndex * 2, entity.customHead.charCodeAt(characterIndex), true);
                                    }
                                    offset += (1 + entity.customHead.length) * 2;

                                    for (var characterIndex = 0; characterIndex < entity.customBody.length; characterIndex++) {
                                        Bit8.setUint16(offset + characterIndex * 2, entity.customBody.charCodeAt(characterIndex), true);
                                    }
                                    offset += (1 + entity.customBody.length) * 2;

                                    for (var characterIndex = 0; characterIndex < entity.customTail.length; characterIndex++) {
                                        Bit8.setUint16(offset + characterIndex * 2, entity.customTail.charCodeAt(characterIndex), true);
                                    }
                                    offset += (1 + entity.customTail.length) * 2;
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


}

module.exports = Snake;