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

class Food {
    type = Enums.EntityTypes.ENTITY_ITEM;
    subtype = Enums.EntitySubtypes.SUB_ENTITY_ITEM_FOOD;
    position = { x: 0, y: 0 };
    spawned = true
    lastUpdate = Date.now();
    constructor(server, x, y, color = Math.random() * 360, origin = null, timeToLive = 5000 + (Math.random() * 60 * 1000 * 5), bypassLimits = false) {
        // Hard protocol cap — NEVER bypassable (uint16 entity-id ceiling).
        // Without this, spawning enough food overflows the 16-bit IDs and
        // aliases entities, corrupting/crashing every connected client.
        if (Object.keys(server.entities).length >= HARD_ENTITY_LIMIT) {
            return
        }
        // bypassLimits lets admins spawn food past the normal caps (maxFood /
        // maxNaturalFood), which otherwise silently drop spawns once reached.
        if (!bypassLimits && server.maxFood && server.maxFood <= Object.keys(server.entities).length) {
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
        
        delete this.server.entities[this.id]; 
    }
}

// Exposed so command handlers can clamp bulk-spawn counts to the remaining
// capacity (and never loop more times than the server could ever hold).
Food.HARD_ENTITY_LIMIT = HARD_ENTITY_LIMIT;

module.exports = Food;