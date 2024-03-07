const Enums = require('./Enums.js');
const Snake = require('./Snake.js');
const Food = require('./Food.js');
const { EntityFunctions, SnakeFunctions } = require("./EntityFunctions.js");
const EventEmitter = require("events");


class Client extends EventEmitter {
    constructor(websocket, ip) {
        super();
        this.socket = websocket;
        this.id = clientIDs.allocateID();
        this.loadedEntities = {};
        this.windowSizeX = 128;
        this.windowSizeY = 64;
        this.dead = true
        clients[this.id] = this;
        if (ip.toString() == "::1") // Set IP to local
            ip = "::ffff:127.0.0.1"
            
        this.ip = (ip.toString()).split(":")[3];
        console.log(`Client connected from "${this.ip}"`);
    }
    RecieveMessage(messageType, view) {
        if (messageType != Enums.ClientToServer.OPCODE_ENTER_GAME && (!this.snake || !this.snake.id)) {
            return
        }
        switch (messageType) {
            case Enums.ClientToServer.OPCODE_CS_PING:
                this.snake.doPong();
                this.snake.doPing();
                break;
            case Enums.ClientToServer.OPCODE_ENTER_GAME:
                var nick = global.getString(view, 1);
                /*console.log("Spawning snake " + nick.string);
                if (!this.snake.spawned)
                    this.snake.spawn(nick.string);*/
                if (!this.snake || !this.snake.spawned) {
                    this.snake = new Snake(this, nick.string);

                }
                break;
            case Enums.ClientToServer.OPCODE_INPUT_POINT:
                let offset = 1;
                let direction = view.getUint8(offset, true);
                offset += 1;
                let vector = view.getFloat32(offset, true);
                offset += 4;
                let isFocused = view.getUint8(offset, true) & 1;
                this.snake.turn(direction, vector);
                break;
            case Enums.ClientToServer.OPCODE_TALK:
                if (this.snake.talkStamina >= 255) {
                    this.snake.Talk(view.getUint8(1, true));
                    this.snake.talkStamina = 0;
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
                if (admins.includes(this.snake.ip)) {
                    let boosting = view.getUint8(1) == 1
                    if (boosting) {
                        this.snake.extraSpeed += 2;
                        if (this.snake.extraSpeed > maxBoostSpeed)
                            this.snake.speedBypass = true
                        this.snake.speed = 0.25 + this.snake.extraSpeed / (255 * UPDATE_EVERY_N_TICKS);
                    } else {
                        this.snake.speedBypass = false;
                        if (this.snake.extraSpeed > maxBoostSpeed)
                            this.snake.extraSpeed = maxBoostSpeed
                    }
                }
                break;
            case Enums.ClientToServer.OPCODE_DEBUG_GRAB:
                if (admins.includes(this.snake.ip))
                    this.snake.length += SnakeFunctions.ScoreToLength(1000);
                break;
            case 0x0d: // Invincible
                if (admins.includes(this.snake.ip))
                    this.snake.invincible = view.getUint8(1, true) == 1;
            
                break;
            case 0x0e: // Commands
                let command = global.getString(view, 1).string;
                if (!command)
                    return
                let commandArgs = command.split(" ");
                if (!commandArgs[0])
                    return
                commandArgs[0] = commandArgs[0].toLowerCase();
                if (admins.includes(this.snake.ip) || commandArgs[0] == "say") {
                    console.log(`Executing command "${command}" from ${this.snake.nick}`);
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
                        case "say":
                            if (commandArgs[1]) {
                                if (!this.dead) {
                                    if (this.snake.talkStamina < 255)
                                        return
                                    let message = commandArgs.slice(1).join(" ");
                                    message = message.substring(0, 25);
                                    this.snake.flags |= Enums.EntityFlags.SHOW_CUSTOM_TALKING
                                    this.snake.customTalk = message;
                                    this.snake.talkStamina = 0;
                                    setTimeout(() => {
                                        if (!this.dead)
                                            this.snake.flags &= ~Enums.EntityFlags.SHOW_CUSTOM_TALKING;
                                    }, 5000)
                                }
                            }
                            break;
                        case "debug":
                            let snake = this.snake;
                            if (commandArgs[1]) {
                                let commandSnake = entities[parseInt(commandArgs[1])];
                                if (commandSnake) {
                                    snake = commandSnake;
                                }
                            }
                            snake.flags ^= Enums.EntityFlags.DEBUG;
                            break
                        case "debugall":
                            Object.values(entities).forEach((entity) => {
                                if (entity.type == Enums.EntityTypes.ENTITY_PLAYER) {
                                    entity.flags ^= Enums.EntityFlags.DEBUG;
                                }
                            })
                            break;

                    }
                }
                break;

        }
    }
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
        this.socket.send(Bit8);
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
                                if (entity.flags & Enums.EntityFlags.DEBUG || entity.debugEnabled) {
                                    calculatedTotalBits += 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 2;
                                    calculatedTotalBits += entity.points.length*8
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
                                if (entity.flags & Enums.EntityFlags.DEBUG || entity.debugEnabled) {
                                    calculatedTotalBits += 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 2;
                                    calculatedTotalBits += entity.points.length*8
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
                                Bit8.setFloat32(offset, entity.visualLength, true);
                                offset += 4;
                                offset += 1;
                                Bit8.setUint16(offset, entity.points.length, true);
                                offset += 2;
                                let is16Bit = 0
                                is16Bit |= 0x80;
                                Bit8.setUint8(offset, is16Bit, true);
                                offset += 1;
                                if (entity.debugEnabled) {
                                    let tempFlags = entity.flags;
                                    tempFlags |= Enums.EntityFlags.DEBUG;
                                    Bit8.setUint16(offset, tempFlags, true);
                                } else {
                                    Bit8.setUint16(offset, entity.flags, true);
                                }
                                offset += 2;
                                if (entity.flags & Enums.EntityFlags.DEBUG || entity.debugEnabled) {
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

                                    if (entity.flags & Enums.EntityFlags.DEBUG) {
                                        entity.debugEnabled = true
                                        Bit8.setUint16(offset, entity.points.length, true);
                                        offset += 2;
                                        for (let i = 0; i < entity.points.length; i++) {
                                            Bit8.setFloat32(offset, entity.points[i].x, true);
                                            offset += 4;
                                            Bit8.setFloat32(offset, entity.points[i].y, true);
                                            offset += 4;
                                        }
                                    }
                                    else { // Debug is disabling
                                        Bit8.setUint16(offset, 0, true);
                                        offset += 2;
                                        entity.debugEnabled = false
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
                                Bit8.setFloat32(offset, entity.visualLength, true);
                                offset += 4;
                                offset += 1;
                                Bit8.setUint16(offset, entity.points.length, true);
                                offset += 2;
                                let is16Bit = 0
                                is16Bit |= 0x80;
                                Bit8.setUint8(offset, is16Bit, true);
                                offset += 1;
                                if (entity.debugEnabled && !(entity.flags & Enums.EntityFlags.DEBUG)) {
                                    let tempFlags = entity.flags;
                                    tempFlags |= Enums.EntityFlags.DEBUG;
                                    Bit8.setUint16(offset, tempFlags, true);
                                } else {
                                    Bit8.setUint16(offset, entity.flags, true);
                                }
                                offset += 2;
                                if (entity.flags & Enums.EntityFlags.DEBUG || entity.debugEnabled) {
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

                                    if (entity.flags & Enums.EntityFlags.DEBUG) {
                                        entity.debugEnabled = true
                                        Bit8.setUint16(offset, entity.points.length, true);
                                        offset += 2;
                                        for (let i = 0; i < entity.points.length; i++) {
                                            Bit8.setFloat32(offset, entity.points[i].x, true);
                                            offset += 4;
                                            Bit8.setFloat32(offset, entity.points[i].y, true);
                                            offset += 4;
                                        }
                                    }
                                    else { // Debug is disabling
                                        Bit8.setUint16(offset, 0, true);
                                        offset += 2;
                                        entity.debugEnabled = false
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
      this.socket.send(Bit8);
    }
}

module.exports = Client;