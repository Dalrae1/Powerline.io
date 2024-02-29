class IDManager {
    constructor() {
        this.nextAvailableID = 1;
        this.releasedIDs = new Set();
    }

    allocateID() {
        if (this.releasedIDs.size > 0) {
            // Reuse a released ID
            const id = this.releasedIDs.values().next().value;
            this.releasedIDs.delete(id);
            return id;
        } else {
            // Allocate a new ID
            return this.nextAvailableID++;
        }
    }

    releaseID(id) {
        this.releasedIDs.add(id);
    }
}
module.exports = IDManager;