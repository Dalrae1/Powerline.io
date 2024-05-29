class MinHeap {
    constructor() {
        this.heap = [];
    }

    push(val) {
        this.heap.push(val);
        this.bubbleUp();
    }

    pop() {
        if (this.heap.length === 1) return this.heap.pop();
        const min = this.heap[0];
        this.heap[0] = this.heap.pop();
        this.bubbleDown();
        return min;
    }

    peek() {
        return this.heap[0];
    }

    bubbleUp() {
        let index = this.heap.length - 1;
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.heap[index] >= this.heap[parentIndex]) break;
            [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
            index = parentIndex;
        }
    }

    bubbleDown() {
        let index = 0;
        const length = this.heap.length;
        const element = this.heap[0];

        while (true) {
            let leftChildIndex = 2 * index + 1;
            let rightChildIndex = 2 * index + 2;
            let leftChild, rightChild;
            let swap = null;

            if (leftChildIndex < length) {
                leftChild = this.heap[leftChildIndex];
                if (leftChild < element) swap = leftChildIndex;
            }

            if (rightChildIndex < length) {
                rightChild = this.heap[rightChildIndex];
                if ((swap === null && rightChild < element) || (swap !== null && rightChild < leftChild)) {
                    swap = rightChildIndex;
                }
            }

            if (swap === null) break;
            [this.heap[index], this.heap[swap]] = [this.heap[swap], this.heap[index]];
            index = swap;
        }
    }

    size() {
        return this.heap.length;
    }
}

class IDManager {
    constructor() {
        this.allocatedIDs = new Set();
        this.releasedIDs = new MinHeap();
        this.nextID = 1;
    }

    allocateID() {
        let id;
        if (this.releasedIDs.size() > 0) {
            id = this.releasedIDs.pop();
            if (this.allocatedIDs.has(id)) {
                // If the ID was already allocated, continue popping from the heap
                return this.allocateID();
            }
        } else {
            id = this.nextID++;
        }
        this.allocatedIDs.add(id);
        return id;
    }

    releaseID(id) {
        if (this.allocatedIDs.has(id)) {
            this.allocatedIDs.delete(id);
            this.releasedIDs.push(id);
        } else {
            console.log(`ID ${id} is not allocated.`);
        }
    }
}

module.exports = IDManager;