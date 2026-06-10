const Enums = require("./Enums.js");
const MapFunctions = require("./MapFunctions.js");

// Entity IDs are sent to clients as uint16 (see Client.update, Food.eat and the
// leaderboard packet), so the server can address at most 65535 simultaneous
// entities — and ID 0 is a reserved "none"/terminator sentinel. We cap the total
// entity count a bit below that ceiling to leave ID headroom for player/bot
// snakes and death-drop food. Exceeding it would overflow the uint16 and alias
// entity IDs, corrupting the protocol. This hard cap is ALWAYS enforced —
// admin "bypassLimits" only skips the soft maxFood / maxNaturalFood caps.
const HARD_ENTITY_LIMIT = 65000;

// Food colour is sent to clients as packed RGB (0xRRGGBB) so it can match any
// snake/skin colour — including pure black (e.g. the Demogorgon skin), which a
// hue alone can't represent. Natural/normal food passes a hue and we convert it
// here; death-drop food passes an explicit RGB from Snake.colorAt().
function packRGB(r, g, b) {
    return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}
function hueToRGB(hue) {
    const h = (((hue % 360) + 360) % 360) / 360;
    const s = 1, l = 0.5;
    const k = n => (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return packRGB(Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255));
}

class Food {
    type = Enums.EntityTypes.ENTITY_ITEM;
    subtype = Enums.EntitySubtypes.SUB_ENTITY_ITEM_FOOD;
    position = { x: 0, y: 0 };
    spawned = true
    lastUpdate = Date.now();
    constructor(server, x, y, color = Math.random() * 360, origin = null, timeToLive = 5000 + (Math.random() * 60 * 1000 * 5), bypassLimits = false, colorRGB = null) {
        // Hard protocol cap — NEVER bypassable (uint16 entity-id ceiling).
        // Without this, spawning enough food overflows the 16-bit IDs and
        // aliases entities, corrupting/crashing every connected client.
        if (server.entityCount >= HARD_ENTITY_LIMIT) {
            return
        }
        // bypassLimits lets admins spawn food past the normal caps (maxFood /
        // maxNaturalFood), which otherwise silently drop spawns once reached.
        if (!bypassLimits && server.maxFood && server.maxFood <= server.entityCount) {
            return
        }
        if (!x) { // Food is natural.
            if (!bypassLimits && server.maxNaturalFood <= server.naturalFood) {
                return
            }
            server.naturalFood++;
            this.natural = true
        }
        this.server = server
        this.value = server.config.FoodValue;
        let thisId = this.server.entityIDs.allocateID();

        if (x == undefined) 
            this.position = MapFunctions.GetFreePosition(this.server);
        else {
            this.position = { x: x, y: y };
        }
        this.color = color
        // Packed RGB sent to clients. Explicit value (death-drop, skin-matched)
        // wins; otherwise derive it from the hue so normal food is unchanged.
        this.colorRGB = (colorRGB != null) ? colorRGB : hueToRGB(color);
        this.id = thisId;
        if (origin)
            this.origin = origin;

        let didInsert = this.server.entityQuadtree.insert(this);
        if (didInsert !== true) {
            //if (this.server.id == 1341)
                //console.log(`Failed to insert food ID ${this.id} into server ${this.server.id} into quadtree because ${didInsert}`);
            if (this.natural)
                this.server.naturalFood--;
            setTimeout(() => {
                this.server.entityIDs.releaseID(this.id);
            }, 1000);
            return
        }

        this.server.entities[thisId] = this;
        this.server.entityCount++;


        setTimeout(() => {
            if (this.server.entities[this.id])
                this.eat();
        }, timeToLive);
        return this;
    }
    
    eat(snake) {
        if (snake && this.origin == snake) {
            return;
        }
        if (!this.spawned)
            return

        var Bit8 = new DataView(new ArrayBuffer(16 + 2 * 1000));
        Bit8.setUint8(0, Enums.ServerToClient.OPCODE_ENTITY_INFO);
        var offset = 1;
        Bit8.setUint16(offset, this.id, true);
        offset += 2;
        Bit8.setUint8(offset, Enums.UpdateTypes.UPDATE_TYPE_DELETE, true);
        offset += 1;
        Bit8.setUint16(offset, snake && snake.id || 0, true);
        offset += 2;
        Bit8.setUint8(offset, Enums.KillReasons.KILLED, true);
        offset += 1;

        // King
        Bit8.setUint16(offset, 0, true);
        offset += 2;
        Bit8.setUint16(offset, this.server.king && this.server.king.id || 0, true);
        offset += 2;
        Bit8.setFloat32(offset, this.server.king && this.server.king.position.x || 0, true);
        offset += 4;
        Bit8.setFloat32(offset, this.server.king && this.server.king.position.y || 0, true);
        offset += 4;

        let isDeleted = this.server.entityQuadtree.delete(this);
        if (isDeleted !== true) {
            if (this.server.id == 1341)
                console.log(`Failed to delete food ID ${this.id} from server ${this.server.id} from quadtree because ${isDeleted}`);
            return
        }

        Object.values(this.server.clients).forEach((client) => {
            if (client.loadedEntities[this.id]) {
                client.socket.send(Bit8);
                delete client.loadedEntities[this.id]
            }
        })
        if (snake) {
            if (Date.now()-snake.lastAte < 500) {
                snake.eatCombo++;
            } else {
                snake.eatCombo = 0;
            }

            snake.length += this.value;
            snake.lastAte = Date.now();
        }
        if (this.natural)
            this.server.naturalFood--;
        this.lastUpdate = Date.now();
        this.spawned = false

        setTimeout(() => {
            this.server.entityIDs.releaseID(this.id);
        }, 1000);

        if (this.server.entities[this.id] !== undefined) this.server.entityCount--;
        delete this.server.entities[this.id];
    }
}

// Exposed so command handlers can clamp bulk-spawn counts to the remaining
// capacity (and never loop more times than the server could ever hold).
Food.HARD_ENTITY_LIMIT = HARD_ENTITY_LIMIT;

module.exports = Food;