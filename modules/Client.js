const Enums = require('./Enums.js');
const Snake = require('./Snake.js');
const Food = require('./Food.js');
const { EntityFunctions, SnakeFunctions } = require("./EntityFunctions.js");
const MapFunctions = require("./MapFunctions.js");
const GlobalFunctions = require("./GlobalFunctions.js")
const EventEmitter = require("events");
const { time } = require('console');


class Client extends EventEmitter {
    constructor(server, websocket, user) {
        super();
        this.server = server
        this.socket = websocket;
        this.id = server.clientIDs.allocateID();
        this.loadedEntities = {};
        this.windowSizeX = 128;
        this.windowSizeY = 64;
        this.dead = true
        this.pointsNearby = {};
        this.ping = this.server.artificialPing;
        this.user = user || null
        this.messagesPerSecond = [];
        this.lastSecondCheck = 0;
        this.spectating = false;
        server.clients[this.id] = this;
        this.sendConfig();

        this.sendMapBarriers()

        this.sendChatHistory()
        
        if (this.user)
            console.log(`Client connected to server ${server.name} from user (${this.user.userid})${this.user.username}`);
        else
            console.log(`Client connected to server ${server.name} from an unautheicated user`);


    }
    pingLoop() {
        this.doPing();
        setTimeout(() => {
            this.pingLoop();
        }, 100);
    }
    async RecieveMessage(messageType, view) {
        await new Promise(r => setTimeout(r, this.server.artificialPing/2));
        if ((!this.snake || !this.snake.id) &&
        (
            messageType != Enums.ClientToServer.OPCODE_ENTER_GAME &&
            messageType != Enums.ClientToServer.OPCODE_HELLO_V4 &&
            messageType != Enums.ClientToServer.OPCODE_HELLO_DEBUG &&
            messageType != Enums.ClientToServer.OPCODE_CS_PING &&
            messageType != Enums.ClientToServer.OPCODE_CS_PONG
            )) {
            return
        }
        if (Date.now() - this.lastSecondCheck > 1000) { // New second elapsed
            this.lastSecondCheck = Date.now();
            this.messagesPerSecond = [];
        }
        if (!this.messagesPerSecond[messageType]) {
            this.messagesPerSecond[messageType] = 1
        } else {
            if (this.messagesPerSecond[messageType] > this.server.config.MaxMessagesPerSecond) {
                return
            }
            this.messagesPerSecond[messageType] += 1
        }
        switch (messageType) {
            case Enums.ClientToServer.OPCODE_CS_PING: // Should pong back
                this.pong();
                break;
            case Enums.ClientToServer.OPCODE_CS_PONG:
                this.ping = Date.now() - this.pingStart;
                break;
            case Enums.ClientToServer.OPCODE_ENTER_GAME:
                var nick = global.getString(view, 1);
                /*console.log("Spawning snake " + nick.string);
                if (!this.snake.spawned)
                    this.snake.spawn(nick.string);*/
                if (nick.string.length > 25)
                    return
                if (!this.snake || !this.snake.spawned) {
                    this.snake = new Snake(this, nick.string || "");

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
                //this.windowSizeX = view.getUint16(1, true);
                //this.windowSizeY = view.getUint16(3, true);
                break;
            case Enums.ClientToServer.OPCODE_HELLO_V4:
                //this.windowSizeX = view.getUint16(1, true);
                //this.windowSizeY = view.getUint16(3, true);
                this.pingLoop();
                break
            case Enums.ClientToServer.OPCODE_HELLO_DEBUG:
                //this.windowSizeX = view.getUint16(1, true);
                //this.windowSizeY = view.getUint16(3, true);
                this.pingLoop();
                break
            case Enums.ClientToServer.OPCODE_BOOST:
                if (this.user && (this.server.admins.includes(this.user.userid) || this.user.rank > 2)) {
                    let boosting = view.getUint8(1) == 1
                    if (boosting) {
                        this.snake.extraSpeed += 2;
                        if (this.snake.extraSpeed > this.server.config.MaxBoostSpeed)
                            this.snake.speedBypass = true
                        this.snake.speed = 0.25 + this.snake.extraSpeed / (255 * UPDATE_EVERY_N_TICKS);
                    } else {
                        this.snake.speedBypass = false;
                        if (this.snake.extraSpeed > this.server.config.MaxBoostSpeed)
                            this.snake.extraSpeed = this.server.config.MaxBoostSpeed
                    }
                }
                break;
            case Enums.ClientToServer.OPCODE_DEBUG_GRAB:
                if (this.user && (this.server.admins.includes(this.user.userid) || this.user.rank > 2))
                    this.snake.length += SnakeFunctions.ScoreToLength(this.server.debugGrabAmount);
                break;
            case 0x0d: // Invincible
            if (this.user && (this.server.admins.includes(this.user.userid) || this.user.rank > 2))
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
                if ((this.user && (this.server.admins.includes(this.user.userid) || this.user.rank > 2)) || commandArgs[0] == "say" || commandArgs[0] == "debug") {
                    console.log(`Executing command "${command}" from ${this.snake.nick}`);
                    switch (commandArgs[0]) {
                        case "debuggrabammount":
                            if (commandArgs[1]) {
                                let amount = parseInt(commandArgs[1]);
                                if (amount && amount >= 0 && amount <= 100000) {
                                    this.server.debugGrabAmount = amount;
                                }
                            }
                            break;
                        case "arenasize":
                            if (commandArgs[1]) {
                                let size = parseInt(commandArgs[1]);
                                if (size && size >= 0 && size <= 10000) {
                                    this.server.config.ArenaSize = size;
                                    Object.values(this.server.clients).forEach((client) => {
                                        client.sendConfig()
                                    })
                                }
                            }
                            break;
                        case "maxboostspeed":
                            if (commandArgs[1]) {
                                let speed = parseInt(commandArgs[1]);
                                if (speed && speed >= 0 && speed <= 1000) {
                                    this.server.config.MaxBoostSpeed = speed;
                                }
                            }
                            break;
                        case "maxrubspeed":
                            if (commandArgs[1]) {
                                let speed = parseInt(commandArgs[1]);
                                if (speed && speed >= 0 && speed <= 1000) {
                                    this.server.config.MaxRubSpeed = speed;
                                }
                            }
                            break;
                        case "updateinterval":
                            if (commandArgs[1]) {
                                let duration = parseInt(commandArgs[1]);
                                if (duration && duration >= 20 && duration <= 10000) {
                                    this.server.config.UpdateInterval = duration;
                                }
                            }
                            break;
                        case "maxfood":
                            if (commandArgs[1]) {
                                let max = parseInt(commandArgs[1]);
                                if (max && max > 0 && max <= 60000) {
                                    this.server.maxFood = max;
                                }
                            }
                            break;
                        case "maxnaturalfood":
                            if (commandArgs[1]) {
                                let max = parseInt(commandArgs[1]);
                                if (max && max > 0 && max <= 10000) {
                                    this.server.maxNaturalFood = max;
                                }
                            }
                            break;
                        case "foodspawnpercent":
                            if (commandArgs[1]) {
                                let rate = parseInt(commandArgs[1]);
                                if (rate && rate > 0 && rate <= 100000) {
                                    this.server.foodSpawnPercent = rate;
                                }
                            }
                            break;
                        case "defaultlength":
                            if (commandArgs[1]) {
                                let length = parseInt(commandArgs[1]);
                                if (length && length > 0 && length <= 100000) {
                                    this.server.config.DefaultLength = length;
                                }
                            }
                            break;
                        case "randomfood":
                            if (commandArgs[1]) {
                                let num = parseInt(commandArgs[1]);
                                if (num && num > 0 && num <= 1000) {
                                    for (let i = 0; i < num; i++) {
                                        new Food(this.server);
                                    }
                                }
                            }
                            break;
                        case "clearfood":
                            Object.values(this.server.entities).forEach((entity) => {
                                if (entity.type == Enums.EntityTypes.ENTITY_ITEM)
                                    entity.eat();
                            })
                            break;
                        case "foodmultiplier":
                            if (commandArgs[1]) {
                                let multiplier = parseInt(commandArgs[1]);
                                if (multiplier && multiplier > 0 && multiplier <= 10) {
                                    this.server.foodMultiplier = multiplier;
                                }
                            }
                            break;
                        case "foodvalue":
                            if (commandArgs[1]) {
                                let value = parseInt(commandArgs[1]);
                                if (value && value > 0 && value <= 10000) {
                                    this.server.config.FoodValue = SnakeFunctions.ScoreToLength(value);
                                    Object.values(this.server.entities).forEach((entity) => {
                                        if (entity.type == Enums.EntityTypes.ENTITY_ITEM)
                                            entity.value = this.server.config.FoodValue;

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
                                    message = message.substring(0, 50);
                                    this.snake.flags |= Enums.EntityFlags.SHOW_CUSTOM_TALKING
                                    this.snake.flags &= ~Enums.EntityFlags.SHOW_TALKING;
                                    this.snake.customTalk = message;
                                    this.snake.talkStamina = 0;
                                    setTimeout(() => {
                                        if (!this.dead)
                                            this.snake.flags &= ~Enums.EntityFlags.SHOW_CUSTOM_TALKING;
                                    }, 5000)

                                    // Send 0XA8 to all clients with name and message    
                                    this.server.chatHistory.push({ nick: this.snake.nick, message: message });
                                    var Bit8 = new DataView(new ArrayBuffer(5 + (this.snake.nick.length*2) + (message.length * 2)));
                                    let offset = 0;
                                    Bit8.setUint8(offset, Enums.ServerToClient.OPCODE_CUSTOM_TALK);
                                    offset += 1;
                                    Bit8, offset = GlobalFunctions.SetNick(Bit8, offset, this.snake.nick);
                                    Bit8, offset = GlobalFunctions.SetNick(Bit8, offset, message);
                                    this.server.clients.forEach((client) => {
                                        client.socket.send(Bit8);
                                    })

                                }
                            }
                            break;
                        case "debug":
                            let snake = this.snake;
                            if (commandArgs[1]) {
                                let commandSnake = this.server.entities[parseInt(commandArgs[1])];
                                if (commandSnake) {
                                    snake = commandSnake;
                                }
                            }
                            snake.flags ^= Enums.EntityFlags.DEBUG;
                            break
                        case "debugall":
                            Object.values(this.server.entities).forEach((entity) => {
                                if (entity.type == Enums.EntityTypes.ENTITY_PLAYER) {
                                    entity.flags ^= Enums.EntityFlags.DEBUG;
                                }
                            })
                            break;
                        case "length":
                            if (commandArgs[1]) {
                                Object.values(this.server.clients).forEach((client) => {
                                    if (client.dead) {
                                        return
                                    }
                                    if (client.snake.nick.toLowerCase() == commandArgs.concat().splice(1).join(" ").toLowerCase()) {
                                        client.snake.length += SnakeFunctions.ScoreToLength(1000);
                                    }
                                })
                            }
                            break;
                        case "speedlock":
                            if (commandArgs[1]) {
                                let speed = parseInt(commandArgs[1]);
                                if (speed && speed >= 0) {
                                    this.snake.extraSpeed = speed;
                                    this.snake.speed = 0.25 + this.snake.extraSpeed / (255 * UPDATE_EVERY_N_TICKS);
                                    this.snake.lockspeed = true
                                }
                            } else {
                                this.snake.lockspeed = false
                            }
                            break;
                        case "teleport":
                            if (commandArgs[1] && commandArgs[2]) {
                                let x = parseFloat(commandArgs[1]);
                                let y = parseFloat(commandArgs[2]);
                                if (!isNaN(x) && !isNaN(y)) {
                                    this.snake.position.x = x;
                                    this.snake.position.y = y;
                                }
                            }
                            break;
                        case "createfood":
                            // Creates amount of food specified near player
                            if (commandArgs[1]) {
                                let amount = parseInt(commandArgs[1]);
                                if (amount && amount > 0 && amount <= 1000) {
                                    for (let i = 0; i < amount; i++) {
                                        new Food(this.server, this.snake.position.x + Math.random() * 10, this.snake.position.y + Math.random() * 10 - 5);
                                    }
                                }
                            }
                            break;

                    }
                }
                break;

        }
    }
    async doPing() { // Send a ping to the client, and wait for a pong
        this.pingStart = Date.now();
        var Bit8 = new DataView(new ArrayBuffer(3));
        Bit8.setUint8(0, Enums.ServerToClient.OPCODE_SC_PING);
        Bit8.setUint16(1, this.ping || 0, true);
        await new Promise(r => setTimeout(r, this.server.artificialPing/2));
        this.socket.send(Bit8);
    }
    async pong() { // Pongs the client back
        var Bit8 = new DataView(new ArrayBuffer(1));
        Bit8.setUint8(0, Enums.ServerToClient.OPCODE_SC_PONG);
        await new Promise(r => setTimeout(r, this.server.artificialPing/2));
        this.socket.send(Bit8);
    }
    sendConfig() {
        var Bit8 = new DataView(new ArrayBuffer(49));
        let cfgType = Enums.ServerToClient.OPCODE_CONFIG;
        let offset = 0;
        Bit8.setUint8(offset, this.server.config.ConfigType); // 176 or 160
        offset += 1;
        Bit8.setFloat32(offset, this.server.config.ArenaSize, true); //Arena Size
        offset += 4;
        if (cfgType == Enums.ServerToClient.OPCODE_CONFIG_2) {
            Bit8.setFloat32(offset, 0, true); //Minimap Entities X Offset
            offset += 4;
            Bit8.setFloat32(offset, 0, true); //Minimap Entities Y Offset
            offset += 4;
        }
        Bit8.setFloat32(offset, this.server.config.DefaultZoom, true); //Default zoom
        offset += 4;
        Bit8.setFloat32(offset, this.server.config.MinimumZoom, true); //Minimum zoom
        offset += 4;
        Bit8.setFloat32(offset, this.server.config.MinimumZoomScore, true); //Minimum zoom score
        offset += 4;
        Bit8.setFloat32(offset, this.server.config.ZoomLevel2, true); //Zoom Level 2
        offset += 4 + 4;
        Bit8.setFloat32(offset, this.server.config.GlobalWebLag, true); //Input Delay, If 0 then no input delay calculations will take place
        offset += 4;
        Bit8.setFloat32(offset, this.server.config.GlobalMobileLag, true); //Not Used
        offset += 4;
        Bit8.setFloat32(offset, this.server.config.OtherSnakeDelay, true); //Other Snake Delay
        offset += 4;
        Bit8.setFloat32(offset, this.server.config.IsTalkEnabled, true); //isTalkEnabled
        this.socket.send(Bit8);
    }

    sendMapBarriers() {
        
        
        var Bit8 = new DataView(new ArrayBuffer(1 + ((4*4) * this.server.barriers.length)));
        let offset = 0;
        Bit8.setUint8(offset, Enums.ServerToClient.OPCODE_MAP_BARRIERS);
        offset += 1;
        for (let i = 0; i < this.server.barriers.length; i++) {
            Bit8.setFloat32(offset, this.server.barriers[i].x, true);
            offset += 4;
            Bit8.setFloat32(offset, this.server.barriers[i].y, true);
            offset += 4;
            Bit8.setFloat32(offset, this.server.barriers[i].width, true);
            offset += 4;
            Bit8.setFloat32(offset, this.server.barriers[i].height, true);
            offset += 4;
        }
        this.socket.send(Bit8);
    }

    sendChatHistory() {
        // send last 50 messages
        this.server.chatHistory.slice(-50).forEach((message) => {
            
            var Bit8 = new DataView(new ArrayBuffer(5 + (message.nick.length * 2) + (message.message.length * 2)));
            let offset = 0;
            Bit8.setUint8(offset, Enums.ServerToClient.OPCODE_CUSTOM_TALK);
            offset += 1;
            Bit8, offset = GlobalFunctions.SetNick(Bit8, offset, message.nick);
            Bit8, offset = GlobalFunctions.SetNick(Bit8, offset, message.message);
            this.socket.send(Bit8);
        })

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
                                    //calculatedTotalBits += entity.points.length*8
                                    let points = this.pointsNearby && this.pointsNearby[entity.id] || []
                                    calculatedTotalBits += points && points.length * 8 || 0
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
                                    //calculatedTotalBits += entity.points.length*8
                                    let points = this.pointsNearby && this.pointsNearby[entity.id] || []
                                    calculatedTotalBits += points && points.length * 8 || 0
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

                                    /*if (entity.flags & Enums.EntityFlags.DEBUG) {
                                        entity.debugEnabled = true
                                        Bit8.setUint16(offset, entity.points.length, true);
                                        offset += 2;
                                        for (let i = 0; i < entity.points.length; i++) {
                                            Bit8.setFloat32(offset, entity.points[i].x, true);
                                            offset += 4;
                                            Bit8.setFloat32(offset, entity.points[i].y, true);
                                            offset += 4;
                                        }
                                    }*/
                                    if (entity.flags & Enums.EntityFlags.DEBUG) {
                                        entity.debugEnabled = true
                                        let pointsss = this.pointsNearby && this.pointsNearby[entity.id] || []
                                        Bit8.setUint16(offset, pointsss.length, true);
                                        offset += 2;
                                        for (let i = 0; i < pointsss.length; i++) {
                                            Bit8.setFloat32(offset, pointsss[i].point.x, true);
                                            offset += 4;
                                            Bit8.setFloat32(offset, pointsss[i].point.y, true);
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
                                    Bit8.setUint16(offset, entity.RubSnake.id, true);
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
                            Bit8, offset = GlobalFunctions.SetNick(Bit8, offset, entity.nick)
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

                                    /*if (entity.flags & Enums.EntityFlags.DEBUG) {
                                        entity.debugEnabled = true
                                        Bit8.setUint16(offset, entity.points.length, true);
                                        offset += 2;
                                        for (let i = 0; i < entity.points.length; i++) {
                                            Bit8.setFloat32(offset, entity.points[i].x, true);
                                            offset += 4;
                                            Bit8.setFloat32(offset, entity.points[i].y, true);
                                            offset += 4;
                                        }
                                    }*/
                                    if (entity.flags & Enums.EntityFlags.DEBUG) {
                                        entity.debugEnabled = true
                                        let pointsss = this.pointsNearby && this.pointsNearby[entity.id] || []
                                        Bit8.setUint16(offset, pointsss.length, true);
                                        offset += 2;
                                        for (let i = 0; i < pointsss.length; i++) {
                                            Bit8.setFloat32(offset, pointsss[i].x, true);
                                            offset += 4;
                                            Bit8.setFloat32(offset, pointsss[i].y, true);
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
                                    Bit8.setUint16(offset, entity.RubSnake.id, true);
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
        Bit8.setUint16(offset, this.server.king && this.server.king.id || 0, true);
        offset += 2;
        Bit8.setFloat32(offset, this.server.king && this.server.king.position.x || 0, true);
        offset += 4;
        Bit8.setFloat32(offset, this.server.king && this.server.king.position.y || 0, true);
        offset += 4;
      this.socket.send(Bit8);
    }
}

module.exports = Client;