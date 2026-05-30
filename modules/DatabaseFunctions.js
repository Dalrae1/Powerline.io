const mysql = require('mysql2');
let os = require('os');
let networkInterfaces = os.networkInterfaces();

class DatabaseFunctions {
    constructor() {
        //const ip = Object.values(networkInterfaces).flat().find(i => i.family == 'IPv4' && !i.internal).address;
        this.pool = mysql.createPool({
            connectionLimit: 10,
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE
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
                this.pool.query(
                    "SELECT userid, username, `rank`, verified_name FROM users WHERE userid = ?",
                    [sessionData[0].userid],
                    function (err, result) {
                        if (err) reject(err);
                        else resolve(result);
                    }
                );
            });
            return userData[0];
        } catch (err) {
            console.error("Error fetching session data: ", err);
            //throw err; // Re-throw the error after logging it
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
            //throw err; // Re-throw the error after logging it
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

            // Return verified_name for display — the Google/Discord username is never sent to clients
            const query = `SELECT userid, verified_name FROM users WHERE userid IN (${placeholders})`;

            const users = await new Promise((resolve, reject) => {
                this.pool.query(query, userIds, function (err, result) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            });

            return JSON.stringify(users);
        } catch (err) {
            console.error("Error fetching users: ", err);
            //throw err; // Re-throw the error after logging it
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
            //throw err; // Re-throw the error after logging it
        }

    }

    async SearchUsers(query) {
        try {
            const users = await new Promise((resolve, reject) => {
                // Search and return only verified_name — the Google/Discord username
                // is a protected field and must never be exposed to other players.
                this.pool.query(
                    "SELECT userid, verified_name FROM users WHERE verified_name LIKE ? LIMIT 10",
                    [`%${query}%`],
                    function (err, result) {
                        if (err) reject(err);
                        else resolve(result);
                    }
                );
            });
            return users;
        } catch (err) {
            console.error("Error searching users: ", err);
            return [];
        }
    }

    async SetVerifiedName(userid, name) {
        try {
            const result = await new Promise((resolve, reject) => {
                this.pool.query(
                    "UPDATE users SET verified_name = ? WHERE userid = ?",
                    [name, userid],
                    function (err, result) {
                        if (err) reject(err);
                        else resolve(result);
                    }
                );
            });
            return result;
        } catch (err) {
            console.error("Error setting verified name: ", err);
            throw err;
        }
    }

    async CheckVerifiedNameAvailable(name) {
        try {
            const rows = await new Promise((resolve, reject) => {
                this.pool.query(
                    "SELECT 1 FROM users WHERE verified_name = ? LIMIT 1",
                    [name],
                    function (err, result) {
                        if (err) reject(err);
                        else resolve(result);
                    }
                );
            });
            return rows.length === 0; // true = available
        } catch (err) {
            console.error("Error checking verified name availability: ", err);
            throw err;
        }
    }

    async UpdateServer(serverInfo) {
        try {
            const result = await new Promise((resolve, reject) => {
                this.pool.query("UPDATE servers SET name = ?, owner = ?, maxplayers = ?, config = ? WHERE id = ?", [serverInfo.name, serverInfo.owner, serverInfo.maxplayers, serverInfo.config, serverInfo.id], function (err, result) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            });

            return result;
        } catch (err) {
            console.error("Error editing server: ", err);
            //throw err; // Re-throw the error after logging it
        }
    }
}

module.exports = DatabaseFunctions;