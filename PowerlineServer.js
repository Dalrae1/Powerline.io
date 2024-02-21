const WebSocket = require('ws');
const HttpsServer = require('https').createServer;
const fs = require("fs");
const EventEmitter = require("events");
const { kill } = require('process');
const { get } = require('http');
/*const server = HttpsServer({
    ssl: true,
    cert: fs.readFileSync("C:\\wamp64\\bin\\apache\\apache2.4.46\\conf\\key\\dalr.ae\\cert.pem"),
    ca: fs.readFileSync("C:\\wamp64\\bin\\apache\\apache2.4.46\\conf\\key\\dalr.ae\\fullchain.pem"),
    key: fs.readFileSync("C:\\wamp64\\bin\\apache\\apache2.4.46\\conf\\key\\dalr.ae\\privkey.pem")
})
const wss = new WebSocket.Server({ port: 1337, server: server });*/
const wss = new WebSocket.Server({ port: 1337});
var snakes = {}
var entities = {}
var clients = {}
var lastClientId = 1
var lastEntityId = 1
var arenaSize = 100
var safezone = 0.01 // Safezone
var updateDuration = 100
var UPDATE_EVERY_N_TICKS = 3;
let maxBoostSpeed = 200;
var foodValue = 1.5;
var scoreMultiplier = 10/foodValue;
var defaultLength = 10;

const MessageTypes = Object.freeze({
    // Server Messages
    SendPingInfo: 0,
    PingLoop: 1,
    SendConfig: 160,
    SendSpawn: 161,
    SendEntities: 163,
    SendEvent: 164,
    SendLeaderboard: 165,
    SendConfigWithMinimapOffset: 176,
    // Client Messages
    RecievePing: 0,
    RecieveNick: 3,
    RecieveLeave: 4,
    RecieveDirection: 5,
    RecieveTurnPoint: 6,
    RecieveResize: 7,
    RecieveBoost: 8,
    RecieveDebugFoodGrab: 9,
    RecieveBigPicture: 11,
    RecieveTalk: 12,
    RecievePong: 16,
    RecieveDebugHello: 171,
    RecieveHello: 191,
})
const EventTypes = Object.freeze({
    Kill: 1,
    Killed: 2
})
const UpdateTypes = Object.freeze({
    OnUpdate: 0,
    OnRender: 1,
    OnRemove: 2
})

const EntityTypes = Object.freeze({
    Collider: 1,
    Item: 4,
    Player: 5
})
const EntitySubtypes = Object.freeze({
    Food: 0,
    Energy: 1,
    TriPlus: 2,
    TriMinus: 3,


})


const EntityFlags = Object.freeze({
    Unused: 1,
    IsRubbing: 2,
    KeepFoodAlive: 4,
    SomethingAffectingPointOffset: 8,
    ShowTrophy: 16,
    ShowKillStreak: 32,
    ShowTalking: 64
})

const KillReasons = Object.freeze({
    LeftScreen: 0,
    Killed: 1,
    Boundary: 2,
    Self: 3,
})

const Directions = Object.freeze({
    None: 0,
    Up: 1,
    Left: 2,
    Down: 3,
    Right: 4
})

class Food {
  type = EntityTypes.Item;
  subtype = EntitySubtypes.Food;
  position = { x: 0, y: 0 };
  value = foodValue;
  constructor(x, y, color, origin) {
    entities[lastEntityId] = this;
    if (x == undefined) 
          this.position = GetRandomPosition();
    else {
        this.position = { x: x, y: y };
    }
    if (color == undefined) this.color = Math.random() * 360;
    else this.color = color;
      this.id = lastEntityId;
    if (origin)
        this.origin = origin.id;
    lastEntityId++;
    Object.values(snakes).forEach((snake) => {
      snake.update(UpdateTypes.OnRender, this);
    });
      setTimeout(() => {
          this.eat();
          
        
      }, 5000+Math.random() * 60000);
    return this;
  }
    eat(snake) {
        if (snake && this.origin == snake.id) {
            return;
        }
        Object.values(clients).forEach((snakee) => {
            var Bit8 = new DataView(new ArrayBuffer(16 + 2 * 1000));
            Bit8.setUint8(0, MessageTypes.SendEntities);
            var offset = 1;
            console.log("Removing entity food " + this.id + " from snake " + snakee.id);
            Bit8.setUint16(offset, this.id, true);
            offset = offset + 2;
            Bit8.setUint8(offset, UpdateTypes.OnRemove, true);
            offset = offset + 1;
            Bit8.setUint16(offset, snake && snake.id || 0, true);
            offset = offset + 2;
            Bit8.setUint8(offset, KillReasons.Killed, true);
            offset = offset + 1;
            Bit8.setFloat32(offset, this.position.x, true);
            offset = offset + 4;
            Bit8.setFloat32(offset, this.position.y, true);
            offset = offset + 4;
            snakee.network.send(Bit8);
        })
        if (snake) {
            snake.length += this.value;
            snake.lastAte = Date.now();
        }
        delete entities[this.id];
        
  }
}

for (let i = 0; i < 30; i++) {
    new Food();
}

function GetRandomPosition() {
    return { x: Math.random() * arenaSize - arenaSize / 2, y: Math.random() * arenaSize - arenaSize / 2 };

}


class Snake {
    network = null;
    nick = "";
    type = EntityTypes.Player;
    constructor(network) {
        this.network = network.socket;
        this.sendConfig();

        if (!this.id) {
          clients[lastClientId] = this;
          lastClientId++;
        }
    }
    sendConfig() {
        var Bit8 = new DataView(new ArrayBuffer(49));
        let cfgType = MessageTypes.SendConfig;
        let offset = 0;
        Bit8.setUint8(offset, cfgType); // 176 or 160
        offset += 1;
        Bit8.setFloat32(offset, arenaSize, true); //Arena Size
        offset += 4;
        if (cfgType == MessageTypes.SendConfigWithMinimapOffset) {
            Bit8.setFloat32(offset, 0, true); //Minimap Entities X Offset
            offset += 4;
            Bit8.setFloat32(offset, 0, true); //Minimap Entities Y Offset
            offset += 4;
        }
        Bit8.setFloat32(offset, 2, true); //Zoom Level
        offset += 4;
        Bit8.setFloat32(offset, 1.5, true); //Max Zoom In
        offset += 4;
        Bit8.setFloat32(offset, 0.15, true); //Max Zoom Out
        offset += 4;
        Bit8.setFloat32(offset, 10, true); //Zoom Level 2
        offset += 4 + 4;
        Bit8.setFloat32(offset, 90, true); //Input Delay, If 0 then no input delay calculations will take place
        offset += 4;
        Bit8.setFloat32(offset, 60, true); //Not Used
        offset += 4;
        Bit8.setFloat32(offset, 40, true); //Other Snake Delay
        offset += 4;
        Bit8.setFloat32(offset, 1, true); //isTalkEnabled
        this.network.send(Bit8);

        
    }
    spawn(name) {
        this.spawned = true;
        var Bit8 = new DataView(new ArrayBuffer(1000));
        Bit8.setUint8(0, MessageTypes.SendSpawn);
        Bit8.setUint32(1, lastEntityId, true);
        this.id = lastEntityId;
        console.log("Spawning snake " + this.id)
        this.nick = name
        // Put snake in random position
        let randomPos = GetRandomPosition();
        this.position = { x: randomPos.x, y: randomPos.y };
        //this.position = { x: 0, y: 0 };
        this.direction = Directions.Up;
        this.speed = 0.25;
        this.extraSpeed = 0;
        this.points = [{x: this.position.x, y: this.position.y}];
        this.newPoints = [];
        this.queuedPoints = [];
        this.talkStamina = 0;
        this.color = Math.random() * 360;
        this.length = defaultLength;



        lastEntityId++;
        snakes[this.id] = this;

        
        this.network.send(Bit8);

        Object.values(snakes).forEach((snake) => {
            console.log("Adding entity " + this.id + " to snake " + snake.id);
            console.log("Adding entity "+snake.id+" to snake "+this.id);
            snake.update(UpdateTypes.OnRender, this); // Update other snakes about this
            this.update(UpdateTypes.OnRender, snake); // Update this snake about other snakes
        })
        Object.values(entities).forEach((food) => {
          this.update(UpdateTypes.OnRender, food);
        });

        
    }
    updateLeaderboard() {
        var Bit8 = new DataView(new ArrayBuffer(1000));
        var offset = 0
        Bit8.setUint8(offset, MessageTypes.SendLeaderboard);
        offset += 1;
        Object.values(snakes).forEach((snake) => {
            Bit8.setUint16(offset, snake.id, true);
            offset += 2;
            Bit8.setUint32(offset, (snake.length - defaultLength)*scoreMultiplier, true);
            offset += 4;
            for (var characterIndex = 0; characterIndex < snake.nick.length; characterIndex++) {
                Bit8.setUint16(offset + characterIndex * 2, snake.nick.charCodeAt(characterIndex), true);
            }
            offset = getNick(Bit8, offset).offset;
        })
        Bit8.setUint16(offset, 0, true);
        offset += 2;
        Bit8.setUint16(offset, this.id, true);
        offset += 2;
        Bit8.setUint32(offset, (this.length - defaultLength)*scoreMultiplier, true);
        offset += 4;
        // Set rank
        // Sort snakes
        let sortedSnakes = Object.values(snakes).sort((a, b) => {
            return b.length - a.length;
        });
        let rank = 0;
        Object.values(sortedSnakes).forEach((snake) => {
            rank++;
            if (snake.id == this.id) {
                return;
            }
        })
        Bit8.setUint16(offset, rank, true);
        offset += 2;

        this.network.send(Bit8);
    }
    addPoint(x, y) {
        this.points.unshift({ x: x, y: y });
        this.newPoints.push({ x: x, y: y });
    }
    turn(direction, vector) {
        let whatVector, oppositeVector;
        if (direction == Directions.Up || direction == Directions.Down) {
            whatVector = "x";
            oppositeVector = "y";
        } else {
            whatVector = "y";
            oppositeVector = "x";
        }
        if (this.direction == direction) {
            return;
        }
        this.position[whatVector] = vector;
        /*if (this.points[0].x == this.position.x && this.points[0].y == this.position.y) {
            console.log("Attempting to add diagonal point");
            return
        }*/
        this.direction = direction;
        this.addPoint(this.position.x, this.position.y);
    }
    rubAgainst(snake, distance) {
        this.flags |= EntityFlags.IsRubbing;
        this.RubSnake = snake.id;
        this.extraSpeed += distance < 1 && 3 || distance < 2 && 2 || distance < 3 && 1;
        if (this.extraSpeed > maxBoostSpeed)
            this.extraSpeed = maxBoostSpeed;
        this.speed = 0.25 + this.extraSpeed / (255 * UPDATE_EVERY_N_TICKS);
    }
    stopRubbing() {
        this.flags &= ~EntityFlags.IsRubbing;
        this.RubSnake = null;
        if (this.extraSpeed > 0)
            this.extraSpeed -= 1
        this.speed = 0.25 + this.extraSpeed / (255 * UPDATE_EVERY_N_TICKS);
    }
    kill(reason, killedByID) {
        if (killedByID != this.id) {
            if (!snakes[killedByID])
                return

            // Send "Killed By"
            var Bit8 = new DataView(new ArrayBuffer(16 + 2 * 1000));
            Bit8.setUint8(0, MessageTypes.SendEvent);
            var offset = 1;
            Bit8.setUint8(offset, EventTypes.Kill, true);
            offset = offset + 1;
            Bit8.setUint16(offset, 0, true); //(ID?), unused.
            offset = offset + 2;
            for (
              var characterIndex = 0;
              characterIndex < this.nick.length;
              characterIndex++
            ) {
              Bit8.setUint16(
                offset + characterIndex * 2,
                this.nick.charCodeAt(characterIndex),
                true
              );
            }

            offset = getNick(Bit8, offset).offset;
            snakes[killedByID].network.send(Bit8);
            // Send "Killed"
            var Bit8 = new DataView(new ArrayBuffer(16 + 2 * 1000));
            Bit8.setUint8(0, MessageTypes.SendEvent);
            var offset = 1;
            Bit8.setUint8(offset, EventTypes.Killed, true);
            offset = offset + 1;
            Bit8.setUint16(offset, 0, true); //(ID?), unused.
            offset = offset + 2;
            for (
                var characterIndex = 0;
                characterIndex < snakes[killedByID].nick.length;
                characterIndex++
            ) {
                Bit8.setUint16(
                offset + characterIndex * 2,
                snakes[killedByID].nick.charCodeAt(characterIndex),
                true
                );
            }
            offset = getNick(Bit8, offset).offset;
            this.network.send(Bit8);
        }
        var Bit8 = new DataView(new ArrayBuffer(16 + 2 * 1000));
        Bit8.setUint8(0, MessageTypes.SendEntities);
        var offset = 1;
        Bit8.setUint16(offset, this.id, true);
        offset = offset + 2;
        Bit8.setUint8(offset, 2, true);
        offset = offset + 1;
        Bit8.setUint16(offset, killedByID, true);
        offset = offset + 2;
        Bit8.setUint8(offset, reason);
        offset = offset + 1;
        Bit8.setFloat32(offset, this.position.x, true); //Kill position X
        offset = offset + 4;
        Bit8.setFloat32(offset, this.position.y, true); //Kill position Y
        offset = offset + 4;
        
        this.network.send(Bit8);
        // Update other snakes
        
        if (!this.spawned) {
            return
        }
        console.log("Removing snake " + this.id);
        Object.values(clients).forEach((snake) => {
            if (snake.id != this.id) {
                
                var Bit8 = new DataView(new ArrayBuffer(16 + 2 * 1000));
                Bit8.setUint8(0, MessageTypes.SendEntities);
                var offset = 1;
                
                Bit8.setUint16(offset, this.id, true);
                offset = offset + 2;
                console.log("Removing entity "+this.id+" from snake "+snake.id);
                Bit8.setUint8(offset, UpdateTypes.OnRemove, true);
                offset = offset + 1;
                Bit8.setUint16(offset, killedByID, true);
                offset = offset + 2;
                Bit8.setUint8(offset, reason);
                offset = offset + 1;
                Bit8.setFloat32(offset, this.position.x, true); //Kill position X
                offset = offset + 4;
                Bit8.setFloat32(offset, this.position.y, true); //Kill position Y
                snake.network.send(Bit8);
            }
        });


        // Every 5 unit convert to 1 food

        let actualLength = 0
        for (let i = -1; i < this.points.length - 1; i++) {
          let point;
          if (i == -1) point = this.position;
          else point = this.points[i];
          let nextPoint = this.points[i + 1];

          let segmentLength = getSegmentLength(point, nextPoint);
          actualLength += segmentLength;
        }

        for (let i = 0; i < actualLength; i+=2) {
            let point = getPointAtDistance(this, i);

            new Food(point.x, point.y, this.color - 25 +Math.random()*50, this);

        }


        this.spawned = false;
        delete snakes[this.id];

    }
    doPong() {
        this.pingStart = Date.now();
        var Bit8 = new DataView(new ArrayBuffer(3));
        Bit8.setUint8(0, MessageTypes.SendPingInfo);
        Bit8.setUint16(1, this.ping || 0, true);
        this.network.send(Bit8);
    }
    doPing() {
        var Bit8 = new DataView(new ArrayBuffer(1));
        Bit8.setUint8(0, MessageTypes.PingLoop);
        this.network.send(Bit8);
    }
    update(updateType, entity) {
        if (!entity.position)
            return
        var Bit8 = new DataView(new ArrayBuffer(16 + 2 * 1000));
        Bit8.setUint8(0, MessageTypes.SendEntities);
        var offset = 1;
        Bit8.setUint16(offset, entity.id, true);
        offset = offset + 2;
        Bit8.setUint8(offset, updateType, true);
        offset = offset + 1;
        if (updateType == UpdateTypes.OnRender) {
            Bit8.setUint8(offset, entity.type, true);
            offset = offset + 1;
            Bit8.setUint8(offset, entity.subtype || 0, true);
            offset = offset + 1;
            if (entity.type == EntityTypes.Player) {
                for (var characterIndex = 0; characterIndex < entity.nick.length;characterIndex++) {
                    Bit8.setUint16(offset + characterIndex * 2, entity.nick.charCodeAt(characterIndex),true);
                }
                offset = getNick(Bit8, offset).offset;
            } else {
                Bit8.setUint16(offset, 0, true);
                offset = offset + 2;
            }
        }
        switch (entity.type) {
            case EntityTypes.Player:
                Bit8.setFloat32(offset, entity.position.x, true);
                offset = offset + 4;
                Bit8.setFloat32(offset, entity.position.y, true);
                offset = offset + 4;
                Bit8.setFloat32(offset, entity.speed, true);
                offset = offset + 4;
                Bit8.setFloat32(offset, entity.length, true);
                offset = offset + 5;
                Bit8.setUint8(offset, entity.points.length, true);
                offset = offset + 2;
                Bit8.setUint8(offset, entity.flags, true);
                offset = offset + 1;
                if (entity.flags & EntityFlags.IsRubbing) {
                    Bit8.setFloat32(offset, entity.rubX, true);
                    offset = offset + 4;
                    Bit8.setFloat32(offset, entity.rubY, true);
                    offset = offset + 4;
                    Bit8.setUint16(offset, entity.RubSnake, true);
                    offset = offset + 2;
                }
                Bit8.setUint8(offset, entity.talkStamina, true);
                offset = offset + 1;
                Bit8.setUint8(offset, entity.extraSpeed, true);
                offset = offset + 1;
                if (updateType == UpdateTypes.OnRender) {
                    for (let i = 0; i < entity.points.length; i++) {
                        let point = entity.points[i];
                        Bit8.setFloat32(offset, point.x, true);
                        offset = offset + 4;
                        Bit8.setFloat32(offset, point.y, true);
                        offset = offset + 4;
                    }
                    Bit8.setUint16(offset, entity.color, true);
                    offset = offset + 3;
                } else if (updateType == UpdateTypes.OnUpdate) {
                    if (entity.newPoints.length > 0) {
                        Bit8.setUint8(offset, /*snake.newPoints.length*/ 1, true);
                        offset++;
                        for (let i = 0; i < /*snake.newPoints.length*/ 1; i++) {
                            let point = entity.newPoints[i];
                            Bit8.setFloat32(offset, point.x, true);
                            offset = offset + 4;
                            Bit8.setFloat32(offset, point.y, true);
                            offset = offset + 4;
                        }
                        
                    }
                }
                break;
            case EntityTypes.Item:
                if (entity.subtype == EntitySubtypes.Food) {
                    Bit8.setFloat32(offset, entity.position.x, true);
                    offset = offset + 4;
                    Bit8.setFloat32(offset, entity.position.y, true);
                    offset = offset + 4;
                    Bit8.setUint16(offset, entity.color, true);
                    offset = offset + 2;

                }
                break;
        }
      this.network.send(Bit8);
    }
    DrawDebugCircle(x, y, color) {
        var Bit8 = new DataView(new ArrayBuffer(49));
        var offset = 0;
        Bit8.setUint8(offset, 0xa7);
        offset += 1;
        Bit8.setUint16(offset, 1, true);
        offset += 2;
        Bit8.setFloat32(offset, x, true);
        offset += 4;
        Bit8.setFloat32(offset, y, true);
        offset += 4;
        Bit8.setUint16(offset, color, true);
        this.network.send(Bit8);

    }
    RecieveMessage(messageType, view) {
        if (messageType != MessageTypes.RecieveNick && !this.id) {
            return
        }
        switch (messageType) {
            case MessageTypes.RecievePing:
                this.doPong();
                this.doPing();
                break;
            case MessageTypes.RecieveNick:
                var nick = getNick(view, 1);
                console.log("Spawning snake " + nick.nick);
                if (!this.spawned)
                    this.spawn(nick.nick);
                break;
            case MessageTypes.RecieveTurnPoint:
                let offset = 1;
                let direction = view.getUint8(offset, true);
                offset += 1;
                let vector = view.getFloat32(offset, true);
                offset += 4;
                let isFocused = view.getUint8(offset, true) & 1;
                this.turn(direction, vector);
                break;
        }
    }

}


let newSnakes = [];

function round(num) {
    return Math.round(num / 1000) * 1000
}
class Client extends EventEmitter {
    constructor(websocket) {
        super();
        this.socket = websocket;
        this.nick = "";
        this.id = 0;
        this.windowSizeX = 0;
        this.windowSizeY = 0;
    }
}




function getNick(data, bitOffset) {
    var nick = "";
    while (true) {
        var charCode = data.getUint16(bitOffset, true);
        bitOffset += 2;
        if (0 == charCode) break;
        nick += String.fromCharCode(charCode);
    }
    return { nick: nick, offset: bitOffset };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

wss.on('connection', async function connection(ws) {
    let client = new Client(ws);
    let snake = new Snake(client);
    ws.on('message', async function incoming(message, req) {
        let view = new DataView(new Uint8Array(message).buffer);
        let messageType = view.getUint8(0);
        snake.RecieveMessage(messageType, view)
    })
    ws.on('close', function close() {
        if (snake.id) {
            snake.kill(KillReasons.LeftScreen, snake.id);
            delete clients[snake.id];
        }
    })
});

function getNormalizedDirection(lineStart, lineEnd) {
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
}

function getSegmentLength(point1, point2) {
    return Math.abs(Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)));
}

function nearestPointOnLine(point, lineStart, lineEnd) // Returns point on line closest to point
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

function onSegment(p, q, r) 
{ 
    if (q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && 
        q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y)) 
       return true; 
  
    return false; 
} 

function orientation(p, q, r) 
{ 
    // See https://www.geeksforgeeks.org/orientation-3-ordered-points/ 
    // for details of below formula. 
    val = (q.y - p.y) * (r.x - q.x) - 
              (q.x - p.x) * (r.y - q.y); 
  
    if (val == 0) return 0;
  
    return (val > 0)? 1: 2;
} 
  
// The main function that returns true if line segment 'p1q1'  
function doIntersect( p1,  q1,  p2,  q2) 
{ 
    // Find the four orientations needed for general and 
    // special cases 
    o1 = orientation(p1, q1, p2); 
    o2 = orientation(p1, q1, q2); 
    o3 = orientation(p2, q2, p1); 
    o4 = orientation(p2, q2, q1); 
  
    // General case 
    if (o1 != o2 && o3 != o4) 
        return true; 
  
    // Special Cases 
    // p1, q1 and p2 are collinear and p2 lies on segment p1q1 
    if (o1 == 0 && onSegment(p1, p2, q1)) return true; 
  
    // p1, q1 and q2 are collinear and q2 lies on segment p1q1 
    if (o2 == 0 && onSegment(p1, q2, q1)) return true; 
  
    // p2, q2 and p1 are collinear and p1 lies on segment p2q2 
    if (o3 == 0 && onSegment(p2, p1, q2)) return true; 
  
     // p2, q2 and q1 are collinear and q1 lies on segment p2q2 
    if (o4 == 0 && onSegment(p2, q1, q2)) return true; 
  
    return false; // Doesn't fall in any of the above cases 
} 

function getPointAtDistance(snake, distance) // Returns point that is distance away from head
{
    let totalPointLength = 0;
    for (let i = -1; i < snake.points.length - 1; i++) {
        let point;
        if (i == -1)
            point = snake.position;
        else
            point = snake.points[i];
        let nextPoint = snake.points[i + 1];

        

        let segmentLength = getSegmentLength(point, nextPoint);
        totalPointLength += segmentLength;
        if (totalPointLength > distance) { // The point is in this segment
            let segmentOverLength = segmentLength - (totalPointLength-distance);
            let direction = getNormalizedDirection(point, nextPoint);
            let lookForPoint = { x: point.x + (direction.x * segmentOverLength), y: point.y + (direction.y * segmentOverLength) };
            //snake.DrawDebugCircle(point.x, point.y, 100);
            //snake.DrawDebugCircle(nextPoint.x, nextPoint.y, 100);
            //snake.DrawDebugCircle(lookForPoint.x, lookForPoint.y, 20);
            return lookForPoint;

        }
    }
    return snake.position;
}


function UpdateArena() { // Main update loop
    Object.values(snakes).forEach(function (snake) {
        let Bit8 = new DataView(new ArrayBuffer(1));
        Bit8.setUint8(0, 0xa8);
        snake.network.send(Bit8);
        
        // Make snakes move
        let totalSpeed = snake.speed //+ (snake.extraSpeed/255);
        if (snake.direction == Directions.Up) {
            snake.position.y += totalSpeed * UPDATE_EVERY_N_TICKS;
        } else if (snake.direction == Directions.Left) {
            snake.position.x -= totalSpeed * UPDATE_EVERY_N_TICKS;
        } else if (snake.direction == Directions.Down) {
            snake.position.y -= totalSpeed * UPDATE_EVERY_N_TICKS;
        } else if (snake.direction == Directions.Right) {
            snake.position.x += totalSpeed * UPDATE_EVERY_N_TICKS;
        }

        // Collision Checks
        if (
            snake.position.x > arenaSize / 2 ||
            snake.position.x < -arenaSize / 2 ||
            snake.position.y > arenaSize / 2 ||
            snake.position.y < -arenaSize / 2
        ) {
            setTimeout(() => { // Make sure they didn't move out of the way
                if (
                    snake.position.x > arenaSize / 2 ||
                    snake.position.x < -arenaSize / 2 ||
                    snake.position.y > arenaSize / 2 ||
                    snake.position.y < -arenaSize / 2
                ) {
                    snake.kill(KillReasons.Boundary, snake.id);
                }
            }, snake.ping || 50)
        }
        let shouldRub = false;
        let secondPoint = snake.points[0];
        // Other snake collision checks
        Object.values(snakes).forEach(function (otherSnake) {
            // Check if head of snake of near body of other snake
            let closestRubLine
            for (let i = -1; i < otherSnake.points.length - 1; i++) {
                let point, nextPoint;
                if (i == -1)
                    point = otherSnake.position;
                else
                    point = otherSnake.points[i];
                nextPoint = otherSnake.points[i + 1];

                // Rubbing Mechanics
                if (otherSnake.id != snake.id) {
                    
                    if (i <= otherSnake.points.length - 1) {
                        let data = nearestPointOnLine(
                            snake.position,
                            point,
                            nextPoint
                        );
                        // Check if this line is in the same direction
                        let direction = getNormalizedDirection(point, nextPoint);
                        let snakeDirection = getNormalizedDirection(snake.position, secondPoint);
                        if (!direction || !snakeDirection)
                            continue;
                        if (!(Math.abs(direction.x) == Math.abs(snakeDirection.x) && Math.abs(direction.y) == Math.abs(snakeDirection.y)))
                            continue;
                        if (data.distance >= 4)
                            continue;
                        if (closestRubLine && data.distance > closestRubLine.distance)
                            continue
                        closestRubLine = {
                            point: data.point,
                            distance: data.distance
                        }
                    }
                    
                }
                if (closestRubLine) {
                    shouldRub = true;
                    snake.rubX = closestRubLine.point.x;
                    snake.rubY = closestRubLine.point.y;
                    snake.rubAgainst(otherSnake, closestRubLine.distance);
                }

                // Collision Mechanics

                if (snake.position != nextPoint && secondPoint != point && snake.position != secondPoint && snake.position != point) {
                    if (doIntersect(snake.position, secondPoint, point, nextPoint)) {
                        setTimeout(() => { // Make sure they didn't move out of the way
                            if (snake.position != nextPoint && secondPoint != point && snake.position != secondPoint && snake.position != point) {
                                if (doIntersect(snake.position, secondPoint, point, nextPoint)) {
                                    if (snake.id == otherSnake.id) {
                                        snake.kill(KillReasons.Self, snake.id);
                                    } else {
                                        snake.kill(KillReasons.Killed, otherSnake.id);
                                    }
                                }
                            }
                        }, snake.ping || 50)
                    }
                }

                // Check if any points are colliding

            }
        })
        if (!shouldRub) {
          snake.stopRubbing();
        }
    });
}

async function main() {
    UpdateArena()

    Object.values(clients).forEach(function (snake) {
        
            Object.values(snakes).forEach(function (otherSnake) {
                if (otherSnake.id && otherSnake.newPoints) {
                    snake.update(UpdateTypes.OnUpdate, otherSnake);
                }
            })
        if (snake.spawned) {
            Object.values(entities).forEach(function (food) {
            // Check if snake is near food
            let distance = Math.sqrt(
                Math.pow(snake.position.x - food.position.x, 2) +
                Math.pow(snake.position.y - food.position.y, 2)
            );
            if (distance < 4) {
                food.eat(snake);
            }
            });
        }
        /*Object.values(entities).forEach(function (food) {
            snake.update(UpdateTypes.OnUpdate, food);
        })*/
    })

    Object.values(snakes).forEach(function (snake) {
        if (snake.spawned) {
            let timeSinceLastAte = Date.now() - snake.lastAte;
            if (timeSinceLastAte < 1000) {
                
                snakes[snake.id].extraSpeed += 3;
                if (snake.extraSpeed > maxBoostSpeed)
                    snakes[snake.id].extraSpeed = maxBoostSpeed;
                snakes[snake.id].speed = 0.25 + snake.extraSpeed / (255 * UPDATE_EVERY_N_TICKS);
            } else {
                if (snake.extraSpeed > 0) {
                    snakes[snake.id].extraSpeed -= 1
                    if (snake.extraSpeed < 0)
                        snakes[snake.id].extraSpeed = 0;
                }
                snakes[snake.id].speed = 0.25 + snake.extraSpeed / (255 * UPDATE_EVERY_N_TICKS);
            }
        }
        snake.updateLeaderboard();
        if (snake.id && snake.newPoints) {
          snake.newPoints.shift();
        }
    })
    
    Object.values(snakes).forEach(function (snake) {
        let totalPointLength = 0;
        for (let i = -1; i < snake.points.length - 1; i++) {
            let point;
            if (i == -1)
                point = snake.position;
            else
                point = snake.points[i];
            let nextPoint = snake.points[i + 1];

            let segmentLength = getSegmentLength(point, nextPoint);
            totalPointLength += segmentLength;
        }
        if (totalPointLength > snake.length) {
            let secondToLastPoint = snake.points[snake.points.length - 2] || snake.position;
            let lastPoint = snake.points[snake.points.length - 1] || snake.position;
            let direction = getNormalizedDirection(secondToLastPoint, lastPoint);

            let amountOverLength = totalPointLength - snake.length;
            let lastSegmentLength = getSegmentLength(secondToLastPoint, lastPoint);

            if (lastSegmentLength > amountOverLength) { // Last segment can be decreased to fit length
                let newPoint = {
                    x: lastPoint.x - direction.x * amountOverLength,
                    y: lastPoint.y - direction.y * amountOverLength
                }
                snake.points[snake.points.length - 1] = newPoint;
            } else { // Last segment is too short, remove it and decrease the next one
                snake.points.pop();
            }
        }
    })

    // Add random food spawns
    let maxFood = arenaSize ^ 2 / 60;
    let foodSpawnPercent = (arenaSize ^ 2) / 10;
    if (Object.keys(entities).length < maxFood) {
        if (Math.random()*100 < foodSpawnPercent) {
            new Food();
        }
        
    }





    setTimeout(() => {
        main()
    }, updateDuration);
}

main()