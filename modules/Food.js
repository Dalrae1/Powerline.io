const Enums = require("./Enums.js");
const MapFunctions = require("./MapFunctions.js");

class Food {
    type = Enums.EntityTypes.ENTITY_ITEM;
    subtype = Enums.EntitySubtypes.SUB_ENTITY_ITEM_FOOD;
    position = { x: 0, y: 0 };
    spawned = true
    lastUpdate = Date.now();
    constructor(server, x, y, color = Math.random() * 360, origin = null, timeToLive = 5000 + (Math.random() * 60 * 1000 * 5)) {
        if (server.maxFood && server.maxFood <= Object.keys(server.entities).length) {
            return
        }
        this.server = server
        this.value = server.config.FoodValue;
        let thisId = this.server.entityIDs.allocateID();

        if (x == undefined) 
            this.position = MapFunctions.GetRandomPosition(this.server);
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
        if (snake) {
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    snake.extraSpeed += 2;
                    if (snake.extraSpeed > this.server.config.MaxBoostSpeed && !snake.speedBypass)
                        snake.extraSpeed = this.server.config.MaxBoostSpeed;
                }, this.server.UpdateInterval * 2 * i)
            }
        }

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
            snake.length += this.value;
            snake.lastAte = Date.now();
        }
        this.lastUpdate = Date.now();
        this.spawned = false
        this.server.entityIDs.releaseID(this.id);
        
        delete this.server.entities[this.id]; 
    }
}

module.exports = Food;