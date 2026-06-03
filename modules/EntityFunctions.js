const MapFunctions = require("./MapFunctions.js");
const Enums = require("./Enums.js");

class EntityFunctions {
    static GetEntitiesInRadius(center, client) {
        const wx = client.windowSizeX;
        const wy = client.windowSizeY;

        // ── snakes: O(1) via segment index ────────────────────────────────────
        // The old approach iterated every snake × every body segment with a
        // LineInsideOrIntersectsRectangle check — O(N × L) per client per tick.
        // The segment index answers the same question in O(1) average by bucketing
        // segments by their fixed coordinate.
        const left  = center.x - wx / 2;
        const right = center.x + wx / 2;
        const yMin  = center.y - wy / 2;
        const yMax  = center.y + wy / 2;
        const snakeSet = client.server.segmentIndex.queryRect(left, right, yMin, yMax);
        const foundEntities = Array.from(snakeSet);

        // ── food: quadtree (unchanged) ─────────────────────────────────────────
        const queryArea = { x: left, y: yMin, width: wx, height: wy };
        for (const entity of client.server.entityQuadtree.query(queryArea))
            foundEntities.push(entity);

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
        // Use Sets for O(1) membership tests. The old code did
        // `entitiesInRadius.includes(entity)` (a linear scan) inside a filter over
        // every loaded entity — O(L × M). With thousands of food that was ~10^8
        // comparisons per client per tick and spiked tick time to ~1s. Sets make
        // this O(L + M).
        const inRadiusSet       = new Set(entitiesInRadius);
        const loadedEntities    = Object.values(client.loadedEntities);
        const loadedEntitiesSet = new Set(loadedEntities);
        const entitiesToAdd    = entitiesInRadius.filter(entity => !loadedEntitiesSet.has(entity));
        const entitiesToRemove = loadedEntities.filter(entity => !inRadiusSet.has(entity) && entity != client.snake);
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