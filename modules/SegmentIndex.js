'use strict';

/**
 * SegmentIndex — Axis-Aligned Segment Spatial Index
 *
 * All snake body segments are either perfectly horizontal (constant y) or
 * perfectly vertical (constant x).  This lets us replace a generic 2-D
 * spatial structure with two 1-D hash maps keyed by the segment's FIXED
 * coordinate:
 *
 *   horizontalBuckets  cellY  →  Map<id, { id, snake, isH:true,  y, xMin, xMax }>
 *   verticalBuckets    cellX  →  Map<id, { id, snake, isH:false, x, yMin, yMax }>
 *
 * A 5 000-unit horizontal segment at y = 42 is stored in exactly ONE bucket
 * (floor(42 / CELL)).  Length is irrelevant to both insert cost and query cost.
 *
 * Query for a head moving RIGHT at y = 10 from x = 99.25 → 100:
 *   1. Check vertical buckets at x ≈ [99.25, 100] (1-2 lookups).
 *   2. Check horizontal bucket at y ≈ 10 (1 lookup, collinear / same-axis).
 *
 * Total: O(1) average regardless of arena size or segment length.
 */

const CELL = 20; // bucket size in world units

class SegmentIndex {
    constructor() {
        this._h      = new Map(); // horizontal segments: cellY → Map<id, seg>
        this._v      = new Map(); // vertical segments:   cellX → Map<id, seg>
        this._nextId = 0;
    }

    static _key(coord) { return Math.floor(coord / CELL); }

    // ── public API ────────────────────────────────────────────────────────────

    /**
     * Register a segment between two endpoints.
     * Returns a handle { id, isH, fixedCoord } used to remove it later.
     * Returns null for zero-length segments (safe to pass back to remove()).
     */
    insert(snake, x1, y1, x2, y2) {
        const dy = Math.abs(y2 - y1);
        const dx = Math.abs(x2 - x1);
        if (dy < 0.001 && dx < 0.001) return null; // zero-length — skip

        const id  = this._nextId++;
        const isH = dy < 0.001;                     // horizontal: y is constant

        if (isH) {
            const y   = (y1 + y2) * 0.5;
            const seg = { id, snake, isH: true, y, xMin: Math.min(x1, x2), xMax: Math.max(x1, x2) };
            const key = SegmentIndex._key(y);
            let   bkt = this._h.get(key);
            if (!bkt) { bkt = new Map(); this._h.set(key, bkt); }
            bkt.set(id, seg);
            return { id, isH: true, fixedCoord: y };
        } else {
            const x   = (x1 + x2) * 0.5;
            const seg = { id, snake, isH: false, x, yMin: Math.min(y1, y2), yMax: Math.max(y1, y2) };
            const key = SegmentIndex._key(x);
            let   bkt = this._v.get(key);
            if (!bkt) { bkt = new Map(); this._v.set(key, bkt); }
            bkt.set(id, seg);
            return { id, isH: false, fixedCoord: x };
        }
    }

    /** Remove a segment by its handle.  Safe to call with null. */
    remove(handle) {
        if (!handle) return;
        const key = SegmentIndex._key(handle.fixedCoord);
        if (handle.isH) this._h.get(key)?.delete(handle.id);
        else             this._v.get(key)?.delete(handle.id);
    }

    /**
     * Find all segments that the one-tick head movement [prevHead → head] in
     * `direction` (a Directions enum value) could cross.
     * Returns an array of segment data objects.
     */
    queryMove(direction, prevHead, head, Directions) {
        const out = [];
        if (direction === Directions.RIGHT || direction === Directions.LEFT) {
            // Moving horizontally: can cross vertical segments (perpendicular)
            // and horizontal segments at the same y (collinear).
            const xMin = Math.min(prevHead.x, head.x);
            const xMax = Math.max(prevHead.x, head.x);
            this._hitV(xMin, xMax, head.y, out);
            this._colH(head.y, xMin, xMax, out);
        } else {
            // Moving vertically: can cross horizontal segments and vertical
            // segments at the same x (collinear).
            const yMin = Math.min(prevHead.y, head.y);
            const yMax = Math.max(prevHead.y, head.y);
            this._hitH(yMin, yMax, head.x, out);
            this._colV(head.x, yMin, yMax, out);
        }
        return out;
    }

    /**
     * Find all segments crossed by the axis-aligned line [x1,y1]→[x2,y2].
     * Used in turn() to scan the full head segment at turn time.
     */
    queryLine(x1, y1, x2, y2) {
        const out = [];
        const isH = Math.abs(y2 - y1) < 0.001;
        if (isH) {
            const y    = (y1 + y2) * 0.5;
            const xMin = Math.min(x1, x2);
            const xMax = Math.max(x1, x2);
            this._hitV(xMin, xMax, y, out);
            this._colH(y, xMin, xMax, out);
        } else {
            const x    = (x1 + x2) * 0.5;
            const yMin = Math.min(y1, y2);
            const yMax = Math.max(y1, y2);
            this._hitH(yMin, yMax, x, out);
            this._colV(x, yMin, yMax, out);
        }
        return out;
    }

    /**
     * Return the Set of unique snake objects that have at least one segment
     * overlapping the rectangle [left, right] × [yMin, yMax].
     * Used by entity streaming to replace the O(N × L) brute-force scan.
     */
    queryRect(left, right, yMin, yMax) {
        const snakes = new Set();

        // Horizontal segments: y in band AND x-range overlaps [left, right]
        const hb0 = SegmentIndex._key(yMin), hb1 = SegmentIndex._key(yMax);
        for (let b = hb0; b <= hb1; b++) {
            const bkt = this._h.get(b);
            if (!bkt) continue;
            for (const seg of bkt.values())
                if (seg.y >= yMin && seg.y <= yMax && seg.xMax >= left && seg.xMin <= right)
                    snakes.add(seg.snake);
        }

        // Vertical segments: x in band AND y-range overlaps [yMin, yMax]
        const vb0 = SegmentIndex._key(left), vb1 = SegmentIndex._key(right);
        for (let b = vb0; b <= vb1; b++) {
            const bkt = this._v.get(b);
            if (!bkt) continue;
            for (const seg of bkt.values())
                if (seg.x >= left && seg.x <= right && seg.yMax >= yMin && seg.yMin <= yMax)
                    snakes.add(seg.snake);
        }

        return snakes;
    }

    /**
     * Find all segments within `radius` world-units of `position`.
     * Used for rubbing detection.
     */
    queryRadius(position, radius) {
        const out  = [];
        const x    = position.x, y = position.y;
        const xMin = x - radius,  xMax = x + radius;
        const yMin = y - radius,  yMax = y + radius;

        // Horizontal segments: y in band, x-range overlaps window
        const hb0 = SegmentIndex._key(yMin), hb1 = SegmentIndex._key(yMax);
        for (let b = hb0; b <= hb1; b++) {
            const bkt = this._h.get(b);
            if (!bkt) continue;
            for (const seg of bkt.values())
                if (seg.y >= yMin && seg.y <= yMax && seg.xMax >= xMin && seg.xMin <= xMax)
                    out.push(seg);
        }

        // Vertical segments: x in band, y-range overlaps window
        const vb0 = SegmentIndex._key(xMin), vb1 = SegmentIndex._key(xMax);
        for (let b = vb0; b <= vb1; b++) {
            const bkt = this._v.get(b);
            if (!bkt) continue;
            for (const seg of bkt.values())
                if (seg.x >= xMin && seg.x <= xMax && seg.yMax >= yMin && seg.yMin <= yMax)
                    out.push(seg);
        }
        return out;
    }

    // ── private helpers ───────────────────────────────────────────────────────

    // Vertical segs with fixed x ∈ [xMin, xMax] whose y-range covers `y`
    _hitV(xMin, xMax, y, out) {
        const b0 = SegmentIndex._key(xMin), b1 = SegmentIndex._key(xMax);
        for (let b = b0; b <= b1; b++) {
            const bkt = this._v.get(b);
            if (!bkt) continue;
            for (const seg of bkt.values())
                if (seg.x >= xMin && seg.x <= xMax && seg.yMin <= y && y <= seg.yMax)
                    out.push(seg);
        }
    }

    // Horizontal segs with fixed y ∈ [yMin, yMax] whose x-range covers `x`
    _hitH(yMin, yMax, x, out) {
        const b0 = SegmentIndex._key(yMin), b1 = SegmentIndex._key(yMax);
        for (let b = b0; b <= b1; b++) {
            const bkt = this._h.get(b);
            if (!bkt) continue;
            for (const seg of bkt.values())
                if (seg.y >= yMin && seg.y <= yMax && seg.xMin <= x && x <= seg.xMax)
                    out.push(seg);
        }
    }

    // Horizontal segs at y ≈ `y` whose x-range overlaps [xMin, xMax]  (collinear)
    _colH(y, xMin, xMax, out) {
        const bkt = this._h.get(SegmentIndex._key(y));
        if (!bkt) return;
        for (const seg of bkt.values())
            if (Math.abs(seg.y - y) < 0.01 && seg.xMax >= xMin && seg.xMin <= xMax)
                out.push(seg);
    }

    // Vertical segs at x ≈ `x` whose y-range overlaps [yMin, yMax]  (collinear)
    _colV(x, yMin, yMax, out) {
        const bkt = this._v.get(SegmentIndex._key(x));
        if (!bkt) return;
        for (const seg of bkt.values())
            if (Math.abs(seg.x - x) < 0.01 && seg.yMax >= yMin && seg.yMin <= yMax)
                out.push(seg);
    }
}

module.exports = SegmentIndex;
