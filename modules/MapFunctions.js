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

    static PointInsideCenteredRectangle(point, rectangle) {
        return point.x >= rectangle.x - rectangle.width / 2 &&
            point.x <= rectangle.x + rectangle.width / 2 &&
            point.y >= rectangle.y - rectangle.height / 2 &&
            point.y <= rectangle.y + rectangle.height / 2;
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

    static Orientation(p, q, r) 
    { 
        // See https://www.geeksforgeeks.org/orientation-3-ordered-points/ 
        // for details of below formula. 
        let val = (q.y - p.y) * (r.x - q.x) - 
                (q.x - p.x) * (r.y - q.y); 
    
        if (val == 0) return 0;
    
        return (val > 0)? 1: 2;
    } 

    static OnSegment(p, q, r) 
    { 
        if (q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && 
            q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y)) 
        return true; 
    
        return false; 
    }

    static DoIntersect( p1,  q1,  p2,  q2) 
    { 
        // Find the four orientations needed for general and 
        // special cases 
        let o1 = MapFunctions.Orientation(p1, q1, p2); 
        let o2 = MapFunctions.Orientation(p1, q1, q2); 
        let o3 = MapFunctions.Orientation(p2, q2, p1); 
        let o4 = MapFunctions.Orientation(p2, q2, q1); 
    
        // General case 
        if (o1 != o2 && o3 != o4) 
            return true; 
    
        // Special Cases 
        // p1, q1 and p2 are collinear and p2 lies on segment p1q1 
        if (o1 == 0 && MapFunctions.OnSegment(p1, p2, q1)) return true; 
    
        // p1, q1 and q2 are collinear and q2 lies on segment p1q1 
        if (o2 == 0 && MapFunctions.OnSegment(p1, q2, q1)) return true; 
    
        // p2, q2 and p1 are collinear and p1 lies on segment p2q2 
        if (o3 == 0 && MapFunctions.OnSegment(p2, p1, q2)) return true; 
    
        // p2, q2 and q1 are collinear and q1 lies on segment p2q2 
        if (o4 == 0 && MapFunctions.OnSegment(p2, q1, q2)) return true; 
    
        return false; // Doesn't fall in any of the above cases 
    }

    static GetNormalizedDirection(lineStart, lineEnd) {
        if (lineStart.y > lineEnd.y) {
            return { x: 0, y: -1 }
        }
        else if (lineStart.y < lineEnd.y) {
            return { x: 0, y: 1 }
        }
        else if (lineStart.x < lineEnd.x) {
            return { x: 1, y: 0 }
        }
        else if (lineStart.x > lineEnd.x) {
            return { x: -1, y: 0 }
        }
        return { x: 0, y: 1}
    }

    static NearestPointOnLine(point, lineStart, lineEnd) // Returns point on line closest to point
    {
        let A = point.x - lineStart.x;
        let B = point.y - lineStart.y;
        let C = lineEnd.x - lineStart.x;
        let D = lineEnd.y - lineStart.y;

        let dot = A * C + B * D;
        let len_sq = C * C + D * D;
        let param = -1;
        if (len_sq != 0) //in case of 0 length line
            param = dot / len_sq;

        let xx, yy;

        if (param < 0) {
            xx = lineStart.x;
            yy = lineStart.y;
        } else if (param > 1) {
            xx = lineEnd.x;
            yy = lineEnd.y;
        } else {
            xx = lineStart.x + param * C;
            yy = lineStart.y + param * D;
        }

        let dx = point.x - xx;
        let dy = point.y - yy;
        return { point: { x: xx, y: yy }, distance: Math.sqrt(dx * dx + dy * dy) };
    }

    static GetRandomPosition(server) {
        return { x: Math.random() * server.config.ArenaSize - server.config.ArenaSize / 2, y: Math.random() * server.config.ArenaSize - server.config.ArenaSize / 2 };
    }

    static GetFreePosition(server) { // Gets position that is not inside any barrier
        let position = MapFunctions.GetRandomPosition(server);

        while (server.barriers.some(barrier => MapFunctions.PointInsideCenteredRectangle(position, barrier))) {
            position = MapFunctions.GetRandomPosition(server);
        }
        return position;
    }

    static GetDistance(point1, point2) {
        const dx = point2.x - point1.x;
        const dy = point2.y - point1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
}

module.exports = {
    LineInsideOrIntersectsRectangle: MapFunctions.LineInsideOrIntersectsRectangle,
    GetRandomPosition: MapFunctions.GetRandomPosition,
    GetFreePosition: MapFunctions.GetFreePosition,
    DoIntersect: MapFunctions.DoIntersect,
    GetNormalizedDirection: MapFunctions.GetNormalizedDirection,
    NearestPointOnLine: MapFunctions.NearestPointOnLine,
    GetDistance: MapFunctions.GetDistance,
};