/**
 * A growable binary buffer writer.
 *
 * Replaces the old two-pass pattern (calculate byte count, allocate DataView,
 * write again) with a single pass: just write fields in order and call
 * toBuffer() at the end.  The backing buffer doubles in size whenever capacity
 * is exhausted, so allocations are O(log n) amortised.
 */
class BinaryWriter {
    constructor(initialCapacity = 256) {
        this._cap  = initialCapacity;
        this._buf  = new Uint8Array(this._cap);
        this._view = new DataView(this._buf.buffer);
        this.offset = 0;
    }

    // ── capacity ─────────────────────────────────────────────────────────────

    _grow(needed) {
        if (this.offset + needed <= this._cap) return;
        this._cap = Math.max(this._cap * 2, this.offset + needed);
        const next = new Uint8Array(this._cap);
        next.set(this._buf);
        this._buf  = next;
        this._view = new DataView(this._buf.buffer);
    }

    // ── primitive writers ─────────────────────────────────────────────────────

    writeUint8(v)   { this._grow(1); this._view.setUint8(this.offset,   v);       this.offset += 1; }
    writeUint16(v)  { this._grow(2); this._view.setUint16(this.offset,  v, true); this.offset += 2; }
    writeUint32(v)  { this._grow(4); this._view.setUint32(this.offset,  v, true); this.offset += 4; }
    writeFloat32(v) { this._grow(4); this._view.setFloat32(this.offset, v, true); this.offset += 4; }

    /**
     * Write a null-terminated UTF-16-LE string.
     * Each code unit is 2 bytes; a 2-byte null terminator is appended.
     */
    writeString(s) {
        this._grow((s.length + 1) * 2);
        for (let i = 0; i < s.length; i++) {
            this._view.setUint16(this.offset, s.charCodeAt(i), true);
            this.offset += 2;
        }
        this._view.setUint16(this.offset, 0, true);
        this.offset += 2;
    }

    // ── output ────────────────────────────────────────────────────────────────

    /** Return an ArrayBuffer containing exactly the bytes written so far. */
    toBuffer() {
        return this._buf.buffer.slice(0, this.offset);
    }
}

module.exports = BinaryWriter;
