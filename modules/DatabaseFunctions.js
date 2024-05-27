const mysql = require('mysql');

class DatabaseFunctions {
    constructor() {
        this.connection = mysql.createConnection({
            host: "localhost",
            user: "powerline",
            password: "",
            database: "powerline"
        });
    }

    async GetUserFromSession(session) {
        try {
            const sessionData = await new Promise((resolve, reject) => {
                this.connection.query("SELECT * FROM sessions WHERE session = ?", [session], function (err, result) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            });

            if (sessionData.length > 0) {
                return sessionData[0].userid;
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