const MapFunctions = require("./MapFunctions.js");
const Enums = require("./Enums.js");

class EntityFunctions {
    static GetEntitiesInRadius(center, entities, checksnake) {
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
    
}

class SnakeFunctions {
    static GetPointAtDistance(snake, distance) // Returns point that is distance away from head
    {
        let totalPointLength = 0;
        for (let i = -1; i < snake.points.length - 1; i++) {
            let point;
            if (i == -1)
                point = snake.position;
            else
                point = snake.points[i];
            let nextPoint = snake.points[i + 1];

            

            let segmentLength = SnakeFunctions.GetSegmentLength(point, nextPoint);
            totalPointLength += segmentLength;
            if (totalPointLength > distance) { // The point is in this segment
                let segmentOverLength = segmentLength - (totalPointLength-distance);
                let direction = MapFunctions.GetNormalizedDirection(point, nextPoint);
                let lookForPoint = { x: point.x + (direction.x * segmentOverLength), y: point.y + (direction.y * segmentOverLength) };
                //snake.DrawDebugCircle(point.x, point.y, 100);
                //snake.DrawDebugCircle(nextPoint.x, nextPoint.y, 100);
                //snake.DrawDebugCircle(lookForPoint.x, lookForPoint.y, 20);
                return lookForPoint;

            }
        }
        return snake.position;
    }
    static GetSegmentLength(point1, point2) {
        return Math.abs(Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)));
    }
    static GetEntitiesNearSnake(snake) { // Returns entities near snake and loaded entities that are not in radius
        let entitiesInRadius = EntityFunctions.GetEntitiesInRadius({ x: snake.position.x, y: snake.position.y }, Object.values(entities), snake);
        let loadedEntities = Object.values(snake.loadedEntities);
        let entitiesToAdd = entitiesInRadius.filter(entity => !loadedEntities.includes(entity));
        let entitiesToRemove = loadedEntities.filter(entity => !entitiesInRadius.includes(entity));
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