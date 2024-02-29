const Enums = require('./Enums.js');
const Snake = require('./Snake.js');
const { EntityFunctions, SnakeFunctions } = require("./EntityFunctions.js");
const EventEmitter = require("events");


class Client extends EventEmitter {
    constructor(websocket, ip) {
        super();
        this.socket = websocket;
        this.id = clientIDs.allocateID();
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
                this.snake.windowSizeX = view.getUint16(1, true)/2;
                this.snake.windowSizeY = view.getUint16(3, true)/2;
                break;
            case Enums.ClientToServer.OPCODE_HELLO_V4:
                this.snake.windowSizeX = view.getUint16(1, true)/2;
                this.snake.windowSizeY = view.getUint16(3, true)/2;
            case Enums.ClientToServer.OPCODE_HELLO_DEBUG:
                this.snake.windowSizeX = view.getUint16(1, true)/2;
                this.snake.windowSizeY = view.getUint16(3, true) / 2;
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
                if (admins.includes(this.snake.ip)) {
                    let command = global.getString(view, 1).string;
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

module.exports = Client;