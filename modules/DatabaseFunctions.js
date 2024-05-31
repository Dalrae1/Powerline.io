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

            if (sessionData.length > 0) {
                return sessionData[0];
            } else {
                return null; // No session found
            }
        } catch (err) {
            console.error("Error fetching session data: ", err);
            throw err; // Re-throw the error after logging it
        }
    }
}

module.exports = DatabaseFunctions;