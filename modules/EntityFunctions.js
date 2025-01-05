const MapFunctions = require("./MapFunctions.js");
const Enums = require("./Enums.js");

class EntityFunctions {
    static GetEntitiesInRadius(center, client) {
        const windowSizeX = client.windowSizeX;
        const windowSizeY = client.windowSizeY;
        const foundEntities = [];

        Object.values(client.server.snakes).forEach(snake => {
            for (let i = -1; i < snake.points.length - 1; i++) {
                const point = (i === -1) ? snake.position : snake.points[i];
                const nextPoint = snake.points[i + 1];
                if (MapFunctions.LineInsideOrIntersectsRectangle(point, nextPoint, center, windowSizeX, windowSizeY)) {
                    foundEntities.push(snake);
                    break;
                }
            }
        })
        const queryArea = { x: center.x-(windowSizeX/2), y: center.y-(windowSizeY/2), width: windowSizeX, height: windowSizeY};
        const foundEntities2 = client.server.entityQuadtree.query(queryArea); // Finds entities within queryArea

        foundEntities2.forEach(entity => {
            //if (entity.position.x >= xMin && entity.position.x <= xMax && entity.position.y >= yMin && entity.position.y <= yMax) {
                foundEntities.push(entity);
            //}
        })

        return foundEntities;
    }
    
}

class SnakeFunctions {
    static GetHeadDistance(snake, otherSnake) {
        let directionVector = SnakeFunctions.GetNormalizedDirection(snake);
        let distanceY = snake.position.y - otherSnake.position.y
        let distanceX = snake.position.x - otherSnake.position.x
        let distance = { x: distanceX, y: distanceY };
        return distance.x*directionVector.x + distance.y*directionVector.y; // Only returns the distance in the direction of the snake
        
    }

    static GetNormalizedDirection(snake) {
        switch (snake.direction) {
            case Enums.Directions.UP:
                return { x: 0, y: 1 };
            case Enums.Directions.RIGHT:
                return { x: 1, y: 0 };
            case Enums.Directions.DOWN:
                return { x: 0, y: -1 };
            case Enums.Directions.LEFT:
                return { x: -1, y: 0 };
        }

    }
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
        const entitiesInRadius = EntityFunctions.GetEntitiesInRadius({ x: position.x, y: position.y}, client);
        const loadedEntitiesSet = new Set(Object.values(client.loadedEntities));
        const entitiesToAdd = entitiesInRadius.filter(entity => !loadedEntitiesSet.has(entity));
        const entitiesToRemove = Object.values(client.loadedEntities).filter(entity => !entitiesInRadius.includes(entity) && entity != client.snake);
        return { entitiesToAdd, entitiesToRemove, entitiesInRadius };
    }

    static GetPointsNearSnake(player1, player2, distance) {
        let width = distance;
        let height = distance;
        let foundPoints = [];
        let center = player1.position;
        let points = player2.points;
    
        for (let i = -1; i < points.length - 1; i++) {
            let point = points[i];
            let nextPoint = points[i + 1];
    
            if (i == -1) {
                point = player2.position;
            }
    
            if (!nextPoint) break;
    
            // Check if the line between the points is within the given distance
            if (MapFunctions.LineInsideOrIntersectsRectangle(point, nextPoint, center, width, height)) {
                let distToPoint = MapFunctions.GetDistance(center, point);
    
                if (distToPoint <= distance) {
                    let beforePoint = i > 0 ? points[i - 1] : null;
                    let afterPoint = i < points.length - 1 ? points[i + 1] : null; // Getting next point
                    if (beforePoint)
                        foundPoints.push({
                            index: i-1,
                            point: beforePoint
                        })
                    foundPoints.push({
                        index: i,
                        point: point
                    })
                    if (afterPoint)
                        foundPoints.push({
                            index: i+1,
                            point: afterPoint
                        })
                }
            }
        }
    
        return foundPoints;
    }
    static LengthToScore(length) {
        let scoreMult = 10 / defaultConfig.FoodValue;
        return length * scoreMult;
    }
    static ScoreToLength(score) {
        let scoreMult = 10/defaultConfig.FoodValue
        return score/scoreMult
    }
    static ScoreToFood(score) {
        return Math.floor(score / 10)
    }
    static GetScoreToDrop(length) {
        let score = (length - defaultConfig.DefaultLength)*SCORE_MULTIPLIER
        let x = Math.ceil(Math.random() * 30 * 10) / 10
        return Math.floor(((score - (score - x) / 6) + 70) / 10) * 10
    }
}

module.exports = {
  EntityFunctions,
  SnakeFunctions,
};