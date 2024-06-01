const mysql = require('mysql');
let os = require('os');
let networkInterfaces = os.networkInterfaces();

class DatabaseFunctions {
    constructor() {
        const ip = Object.values(networkInterfaces).flat().find(i => i.family == 'IPv4' && !i.internal).address;
        let env = "production"
        if (ip == "10.0.0.170") {
            env = "development"
        }
        this.pool = mysql.createPool({
            connectionLimit: 10,
            host: env == "development" ? "dalr.ae" : "localhost",
            user: "powerline",
            password: "",
            database: "powerline"
        });
        
        
    }

    async GetUserFromSession(session) {
        try {
            const sessionData = await new Promise((resolve, reject) => {
                this.pool.query("SELECT * FROM sessions WHERE session = ?", [session], function (err, result) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            });

            if (sessionData.length == 0)
                return null;
            const userData = await new Promise((resolve, reject) => {
                this.pool.query("SELECT * FROM users WHERE userid = ?", [sessionData[0].userid], function (err, result) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            })
            return userData[0]
        } catch (err) {
            console.error("Error fetching session data: ", err);
            throw err; // Re-throw the error after logging it
        }
    }

    async GetServers() {
        try {
            const servers = await new Promise((resolve, reject) => {
                this.pool.query("SELECT * FROM servers", function (err, result) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            });

            return servers;
        } catch (err) {
            console.error("Error fetching servers: ", err);
            throw err; // Re-throw the error after logging it
        }
    }

    async GetUsers(userIds) {
        try {
            // Ensure userIds is an array
            if (!Array.isArray(userIds) || userIds.length === 0) {
                throw new Error("userIds must be a non-empty array");
            }
    
            // Create a comma-separated list of placeholders
            const placeholders = userIds.map(() => '?').join(',');
    
            // Construct the query
            const query = `SELECT userid, username FROM users WHERE userid IN (${placeholders})`;
    
            const users = await new Promise((resolve, reject) => {
                this.pool.query(query, userIds, function (err, result) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            });
    
            return JSON.stringify(users); // Assuming you want to return JSON serialized result
        } catch (err) {
            console.error("Error fetching users: ", err);
            throw err; // Re-throw the error after logging it
        }
    }

    async CreateServer(serverInfo) {
        try {
            const result = await new Promise((resolve, reject) => {
                this.pool.query("INSERT INTO servers (id, name, owner, maxplayers, config) VALUES (?, ?, ?, ?, ?)", [serverInfo.id, serverInfo.name, serverInfo.owner, serverInfo.maxplayers, serverInfo.config], function (err, result) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            });

            return result;
        } catch (err) {
            console.error("Error creating server: ", err);
            throw err; // Re-throw the error after logging it
        }

    }
}

module.exports = DatabaseFunctions;