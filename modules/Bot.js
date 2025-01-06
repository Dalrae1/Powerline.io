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
        this.client = this.initializeClient(server);
        this.nickname = this.generateNickname();
        this.enterGame();
        setInterval(this.update.bind(this), 50);
        this.randomTurner();
    }

    initializeClient(server) {
        const simulatedWs = { send: (data) => {} };
        return new Client(server, simulatedWs, null);
    }

    generateNickname() {
        return "Bot" + Math.floor(Math.random() * 1000);
    }

    enterGame() {
        try {
            const dataview = this.createNicknameDataView(this.nickname);
            this.client.RecieveMessage(Enums.ClientToServer.OPCODE_ENTER_GAME, dataview);
        } catch (error) {
            console.error('Error entering game:', error);
        }
    }

    createNicknameDataView(nickname) {
        const buffer = new ArrayBuffer(1 + (1 + nickname.length) * 2);
        let dataview = new DataView(buffer);
        let offset = 1;
        dataview, offset = GlobalFunctions.SetNick(dataview, offset, nickname);
        return dataview;
    }

    update() {
        if (!this.client.snake) {
            this.enterGame();
            return;
        }

        if (this.detectCollision() || this.detectBoundary()) {
            this.avoidCollision();
        }
    }

    randomTurner() {
        const time = getRandomArbitrary(50, 12000);
        setTimeout(() => {
            this.randomTurn();
            this.randomTurner();
        }, time);
    }

    detectCollision() {
        const snake = this.client.snake;
        const futurePosition = this.getFuturePosition(snake);

        return Object.values(this.client.loadedEntities).some(entity => {
            if (entity.type === Enums.EntityTypes.ENTITY_PLAYER) {
                return this.checkEntityCollision(snake, entity, futurePosition);
            }
            return false;
        });
    }

    detectBoundary() {
        const snake = this.client.snake;
        const futurePosition = this.getFuturePosition(snake);
        const arenaSize = this.server.config.ArenaSize / 2;

        return (
            futurePosition.x > arenaSize ||
            futurePosition.x < -arenaSize ||
            futurePosition.y > arenaSize ||
            futurePosition.y < -arenaSize
        );
    }

    checkEntityCollision(snake, entity, futurePosition) {
        const points = entity.points.concat([entity.position]);
        for (let i = 0; i < points.length - 1; i++) {
            const pointA = points[i];
            const pointB = points[i + 1];
            if (entity === snake && snake.position === pointB) continue;
            if (MapFunctions.DoIntersect(snake.position, futurePosition, pointA, pointB)) {
                return true;
            }
        }
        return false;
    }

    getFuturePosition(snake) {
        const futurePosition = { ...snake.position };
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
        const snake = this.client.snake;
        const validDirections = this.getValidDirections(snake.direction);
        let safeDirection = null;

        for (const direction of validDirections) {
            const futurePosition = this.getFuturePositionInDirection(snake, direction);
            const isSafe = !Object.values(this.client.loadedEntities).some(entity => {
                if (entity.type === Enums.EntityTypes.ENTITY_PLAYER) {
                    return this.checkEntityCollisionWithDirection(snake, entity, futurePosition);
                }
                return false;
            }) && !this.isOutOfBounds(futurePosition);

            if (isSafe) {
                safeDirection = direction;
                break;
            }
        }

        if (safeDirection) {
            this.turnToDirection(safeDirection);
        } else {
            this.randomTurn();
        }
    }

    isOutOfBounds(position) {
        const arenaSize = this.server.config.ArenaSize / 2;
        return (
            position.x > arenaSize ||
            position.x < -arenaSize ||
            position.y > arenaSize ||
            position.y < -arenaSize
        );
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

    getFuturePositionInDirection(snake, direction) {
        const futurePosition = { ...snake.position };
        const distance = 30;

        switch (direction) {
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

    checkEntityCollisionWithDirection(snake, entity, futurePosition) {
        const points = entity.points.concat([entity.position]);
        for (let i = 0; i < points.length - 1; i++) {
            const pointA = points[i];
            const pointB = points[i + 1];
            if (entity === snake && snake.position === pointB) continue;
            if (MapFunctions.DoIntersect(snake.position, futurePosition, pointA, pointB)) {
                return true;
            }
        }
        return false;
    }

    turnToDirection(direction) {
        const snake = this.client.snake;
        const axis = (direction === Enums.Directions.LEFT || direction === Enums.Directions.RIGHT) ? 'y' : 'x';

        try {
            snake.turn(direction, snake.position[axis]);
        } catch (error) {
            console.error('Error during turn:', error);
        }
    }

    randomTurn() {
        if (!this.client.snake) return;

        const validDirections = this.getValidDirections(this.client.snake.direction);
        const newDirection = validDirections[Math.floor(Math.random() * validDirections.length)];
        this.turnToDirection(newDirection);
    }
}

module.exports = Bot;
