const MapFunctions = require("./MapFunctions.js");
const Enums = require("./Enums.js");

class EntityFunctions {
    static GetEntitiesInRadius(center, entities, client) {
        const windowSizeX = client.windowSizeX;
        const windowSizeY = client.windowSizeY;
        const xMin = center.x - windowSizeX / 2;
        const xMax = center.x + windowSizeX / 2;
        const yMin = center.y - windowSizeY / 2;
        const yMax = center.y + windowSizeY / 2;
        const foundEntities = [];

        entities.forEach(entity => {
            if (entity.type === Enums.EntityTypes.ENTITY_PLAYER) {
                for (let i = -1; i < entity.points.length - 1; i++) {
                    const point = (i === -1) ? entity.position : entity.points[i];
                    const nextPoint = entity.points[i + 1];
                    if (MapFunctions.LineInsideOrIntersectsRectangle(point, nextPoint, center, windowSizeX, windowSizeY)) {
                        foundEntities.push(entity);
                        break;
                    }
                }
            } else if (entity.type === Enums.EntityTypes.ENTITY_ITEM) {
                if (entity.position.x >= xMin && entity.position.x <= xMax && entity.position.y >= yMin && entity.position.y <= yMax) {
                    foundEntities.push(entity);
                }
            }
        });

        return foundEntities;
    }
    
}

class SnakeFunctions {
    static GetPointAtDistance(snake, distance) {
        let totalPointLength = 0;
        for (let i = -1; i < snake.points.length - 1; i++) {
            const point = (i === -1) ? snake.position : snake.points[i];
            const nextPoint = snake.points[i + 1];
            const segmentLength = SnakeFunctions.GetSegmentLength(point, nextPoint);
            totalPointLength += segmentLength;
            if (totalPointLength > distance) {
                const segmentOverLength = segmentLength - (totalPointLength - distance);
                const direction = MapFunctions.GetNormalizedDirection(point, nextPoint);
                return { x: point.x + (direction.x * segmentOverLength), y: point.y + (direction.y * segmentOverLength) };
            }
        }
        return snake.position;
    }
    static GetSegmentLength(point1, point2) {
        return Math.abs((point2.x - point1.x) + (point2.y - point1.y));
    }
    static GetEntitiesNearClient(client) {
        let position = client.dead ? client.deadPosition : (client.snake ? client.snake.position : null)
        if (!position) return { entitiesToAdd: [], entitiesToRemove: [] };
        const entitiesInRadius = EntityFunctions.GetEntitiesInRadius({ x: position.x, y: position.y}, Object.values(entities), client);
        const loadedEntitiesSet = new Set(Object.values(client.loadedEntities));
        const entitiesToAdd = entitiesInRadius.filter(entity => !loadedEntitiesSet.has(entity));
        const entitiesToRemove = Object.values(client.loadedEntities).filter(entity => !entitiesInRadius.includes(entity));
        return { entitiesToAdd, entitiesToRemove };
    }

    static GetPointsNearSnake(player1, player2, distance) {
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
    static LengthToScore(length) {
        return (length - defaultLength)*scoreMultiplier
    }
    static ScoreToLength(score) {
        return score/scoreMultiplier
    }
    static ScoreToFood(score) {
        return Math.floor(score / 10)
    }
    static GetScoreToDrop(length) {
        let score = (length - defaultLength)*scoreMultiplier
        let x = Math.ceil(Math.random() * 30 * 10) / 10
        return Math.floor(((score - (score - x) / 6) + 70) / 10) * 10
    }
}

module.exports = {
  EntityFunctions,
  SnakeFunctions,
};