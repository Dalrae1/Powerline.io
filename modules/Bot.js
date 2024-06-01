const Client = require('./Client');
const Enums = require('./Enums');
const GlobalFunctions = require("./GlobalFunctions.js");
const MapFunctions = require("./MapFunctions.js");

function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
}

class Bot {
    constructor(server) {
        this.server = server;

        let simulatedWs = {
            send: (data) => {}
        };

        let botClient = new Client(this.server, simulatedWs, -1);

        this.client = botClient;

        let nick = "Bot" + Math.floor(Math.random() * 1000);
        let dataview = new DataView(new ArrayBuffer(1 + (1 + nick.length) * 2));
        let offset = 1;
        dataview, offset = GlobalFunctions.SetNick(dataview, offset, nick);

        this.client.RecieveMessage(Enums.ClientToServer.OPCODE_ENTER_GAME, dataview);

        setInterval(() => {
            if (this.client.snake == null) {
                this.client.RecieveMessage(Enums.ClientToServer.OPCODE_ENTER_GAME, dataview);
                return;
            }

            if (this.detectCollision(this.client)) {
                this.avoidCollision(this.client);
            } else {
                //
            }

        }, 50);

        this.randomTurner();
    }

    randomTurner() {
        let time = getRandomArbitrary(50, 12000);
        console.log("Time: " + time);
        setTimeout(() => {
            this.randomTurn();
            this.randomTurner()
        }, time)

    }

    detectCollision() {
        let snake = this.client.snake;
        let loadedEntities = this.client.loadedEntities;
        let futurePosition = this.getFuturePosition(snake);
        let isCollision

        for (const [key, entity] of Object.entries(loadedEntities)) {
            if (entity.type === Enums.EntityTypes.ENTITY_PLAYER) {
                let points = entity.points.concat([entity.position]);

                for (let j = 0; j < points.length - 1; j++) {
                    let pointA = points[j];
                    let pointB = points[j + 1];
                    if (entity == snake && snake.position == pointB)
                        continue
                    if (MapFunctions.DoIntersect(snake.position, futurePosition, pointA, pointB)) {
                        console.log("Detected collision")
                        return true;
                    }
                }
            }
        }
        return false;
    }

    getFuturePosition(snake) {
        let futurePosition = { ...snake.position };
        const distance = 30;

        switch (snake.direction) {
            case Enums.Directions.UP:
                futurePosition.y += distance;
                break;
            case Enums.Directions.RIGHT:
                futurePosition.x += distance;
                break;
            case Enums.Directions.DOWN:
                futurePosition.y -= distance;
                break;
            case Enums.Directions.LEFT:
                futurePosition.x -= distance;
                break;
        }
        return futurePosition;
    }

    avoidCollision() {
        this.randomTurn();
    }

    getValidDirections(currentDirection) {
        switch (currentDirection) {
            case Enums.Directions.UP:
                return [Enums.Directions.LEFT, Enums.Directions.RIGHT];
            case Enums.Directions.RIGHT:
                return [Enums.Directions.UP, Enums.Directions.DOWN];
            case Enums.Directions.DOWN:
                return [Enums.Directions.LEFT, Enums.Directions.RIGHT];
            case Enums.Directions.LEFT:
                return [Enums.Directions.UP, Enums.Directions.DOWN];
            default:
                return [];
        }
    }

    randomTurn() {
        if (this.client.snake == null) return;
        let validDirections = this.getValidDirections(this.client.snake.direction);
        let newDirection = validDirections[Math.floor(Math.random() * validDirections.length)];
        this.client.snake.turn(newDirection, this.client.snake.position[(newDirection === Enums.Directions.LEFT || newDirection === Enums.Directions.RIGHT) ? 'y' : 'x']);
    }
}

module.exports = Bot;