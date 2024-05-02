const IDManager = require("./modules/IDManager.js");
const Enums = require("./modules/Enums.js");
const Food = require("./modules/Food.js");
const Snake = require("./modules/Snake.js");
const MapFunctions = require("./modules/MapFunctions.js");
const { EntityFunctions, SnakeFunctions } = require("./modules/EntityFunctions.js");
const Quadtree = require("./modules/Quadtree.js");
const Client = require("./modules/Client.js");



class Server {
    constructor() {
        this.config = {
            // Client config
            ConfigType: Enums.ServerToClient.OPCODE_CONFIG,
            ArenaSize: 300,
            DefaultZoom: 2,
            MinimumZoom: 1.5,
            MinimumZoomScore: 100,
            ZoomLevel2: 10,
            GlobalWebLag: 90,
            GlobalMobileLag: 60, // Not used
            OtherSnakeDelay: 40,
            IsTalkEnabled: 1,

            // Server config
            FoodValue: 1.5,
            UpdateInterval: 100,
            MaxBoostSpeed: 255,
            MaxRubSpeed: 200,
            DefaultLength: 10,
        }

        this.entityIds = new IDManager(this);
        this.clientIds = new IDManager(this);
        this.entityQuadtree = new Quadtree(this, {
            x: -this.config.ArenaSize / 2,
            y: -this.config.ArenaSize / 2,
            width: this.config.ArenaSize,
            height: this.config.ArenaSize
        }, 10)

        this.foodMultiplier = 1;
        this.maxFood = this.config.ArenaSize * 5;
        this.foodSpawnPercent = (this.config.ArenaSize ^ 2) / 10;
        this.artificialPing = 0;



        this.king = null;
        this.lastUpdate = 0;
        this.admins = [];
        this.entities = [];
        this.clients = [];
        this.snakes = [];



        

    }
}

module.exports = Server;