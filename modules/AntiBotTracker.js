/**
 * AntiBotTracker
 *
 * Shared singleton that tracks per-IP behaviour across all game servers and the
 * HTTP layer.  Imported by both PowerlineServer.js (WebSocket gating) and
 * Client.js (ENTER_GAME gating).
 *
 * Layers:
 *   1. Concurrent connection cap per IP  – limits how many WS slots one IP can
 *      hold simultaneously, bounding bot farm density even through proxy rotation.
 *
 *   2. Per-IP ENTER_GAME rate window     – sliding 60-second counter; bots that
 *      cycle connections quickly to dodge the cooldown still hit this ceiling.
 *
 * The numbers are deliberately generous for school networks:
 *   MAX_CONNECTIONS : 30 simultaneous WS connections per IP (≈ a full class)
 *   MAX_ENTERS_PER_MIN : 120 game entries per IP per 60 s  (2/s average)
 *
 * Per-connection progressive cooldown (separate, lives in Client.js):
 *   fast death 1 →  3 s wait
 *   fast death 2 → 10 s
 *   fast death 3 → 30 s
 *   fast death 4 → 90 s
 *   fast death 5+→ 300 s  (5 min)
 */

'use strict';

const MAX_CONNECTIONS    = 30;
const MAX_ENTERS_PER_MIN = 120;
const ENTER_WINDOW_MS    = 60_000;

// ip → current number of open websocket connections
const connectionCounts = new Map();

// ip → { count: number, windowStart: number }
const enterRates = new Map();

// ── connection tracking ───────────────────────────────────────────────────────

function isConnectionAllowed(ip) {
    return (connectionCounts.get(ip) || 0) < MAX_CONNECTIONS;
}

function onConnected(ip) {
    connectionCounts.set(ip, (connectionCounts.get(ip) || 0) + 1);
}

function onDisconnected(ip) {
    const c = (connectionCounts.get(ip) || 1) - 1;
    if (c <= 0) connectionCounts.delete(ip);
    else         connectionCounts.set(ip, c);
}

// ── enter-rate tracking ───────────────────────────────────────────────────────

/**
 * Returns true if this IP is still within its ENTER_GAME rate budget.
 * Call this before allowing an ENTER_GAME; it both checks AND increments.
 */
function tryRecordEnter(ip) {
    if (!ip) return true; // unknown IP — don't block
    const now = Date.now();
    let slot = enterRates.get(ip);
    if (!slot || now - slot.windowStart >= ENTER_WINDOW_MS) {
        slot = { count: 0, windowStart: now };
    }
    slot.count++;
    enterRates.set(ip, slot);
    return slot.count <= MAX_ENTERS_PER_MIN;
}

// ── periodic cleanup (prevent unbounded map growth) ──────────────────────────

setInterval(() => {
    const cutoff = Date.now() - ENTER_WINDOW_MS * 2;
    for (const [ip, slot] of enterRates) {
        if (slot.windowStart < cutoff) enterRates.delete(ip);
    }
    // connectionCounts is kept accurate by onConnected/onDisconnected; no GC needed
}, 5 * 60_000);

module.exports = { isConnectionAllowed, onConnected, onDisconnected, tryRecordEnter };
