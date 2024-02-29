class MapFunctions {
    static LineSegmentsIntersect(line1Start, line1End, line2Start, line2End) {
        const det = (line1End.x - line1Start.x) * (line2End.y - line2Start.y) - (line2End.x - line2Start.x) * (line1End.y - line1Start.y);
        if (det === 0) {
            return false;
        } else {
            const lambda = ((line2End.y - line2Start.y) * (line2End.x - line1Start.x) + (line2Start.x - line2End.x) * (line2End.y - line1Start.y)) / det;
            const gamma = ((line1Start.y - line1End.y) * (line2End.x - line1Start.x) + (line1End.x - line1Start.x) * (line2End.y - line1Start.y)) / det;
            return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
        }
    }

    static PointInsideRectangle(point, rectangle) {
        return point.x >= rectangle.x &&
            point.x <= rectangle.x + rectangle.width &&
            point.y >= rectangle.y &&
            point.y <= rectangle.y + rectangle.height;
    }

    static LineInsideOrIntersectsRectangle(lineStart, lineEnd, center, width, height) {
        const rectangle = {
            x: center.x - width / 2,
            y: center.y - height / 2,
            width: width,
            height: height
        };

        // Check if either endpoint of the line segment is inside the rectangle
        if (MapFunctions.PointInsideRectangle(lineStart, rectangle) || MapFunctions.PointInsideRectangle(lineEnd, rectangle)) {
            return true;
        }

        // Check if the line segment intersects any of the sides of the rectangle
        const rectangleEdges = [
            [{ x: rectangle.x, y: rectangle.y }, { x: rectangle.x + rectangle.width, y: rectangle.y }], // Top edge
            [{ x: rectangle.x + rectangle.width, y: rectangle.y }, { x: rectangle.x + rectangle.width, y: rectangle.y + rectangle.height }], // Right edge
            [{ x: rectangle.x, y: rectangle.y + rectangle.height }, { x: rectangle.x + rectangle.width, y: rectangle.y + rectangle.height }], // Bottom edge
            [{ x: rectangle.x, y: rectangle.y }, { x: rectangle.x, y: rectangle.y + rectangle.height }] // Left edge
        ];

        for (const edge of rectangleEdges) {
            if (MapFunctions.LineSegmentsIntersect(lineStart, lineEnd, edge[0], edge[1])) {
                return true;
            }
        }
        return false;
    }

    static GetRandomPosition() {
        return { x: Math.random() * arenaSize - arenaSize / 2, y: Math.random() * arenaSize - arenaSize / 2 };
    }
}

module.exports = {
    LineSegmentsIntersect: MapFunctions.LineSegmentsIntersect,
    PointInsideRectangle: MapFunctions.PointInsideRectangle,
    LineInsideOrIntersectsRectangle: MapFunctions.LineInsideOrIntersectsRectangle,
    GetRandomPosition: MapFunctions.GetRandomPosition
};