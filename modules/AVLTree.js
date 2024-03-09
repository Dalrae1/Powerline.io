class Node {
    constructor(key, data) {
        this.key = key;
        this.dataSet = new Set([data]);
        this.left = null;
        this.right = null;
        this.height = 1;
    }
}

class AVLTree {
    constructor() {
        this.root = null;
        this.valueToKeyMap = new Map();
    }

    insert(key, data) {
        this.root = this._insertRec(this.root, key, data);
        if (!this.valueToKeyMap.has(data)) {
            this.valueToKeyMap.set(data, new Set([key]));
        } else {
            this.valueToKeyMap.get(data).add(key);
        }
    }

    _insertRec(node, key, data) {
        if (node === null) {
            // If the node is null, a new Node is created and returned
            let newNode = new Node(key, data);
            if (!this.valueToKeyMap.has(data)) {
                this.valueToKeyMap.set(data, new Set([key]));
            } else {
                this.valueToKeyMap.get(data).add(key);
            }
            return newNode;
        }

        if (key < node.key) {
            node.left = this._insertRec(node.left, key, data);
        } else if (key > node.key) {
            node.right = this._insertRec(node.right, key, data);
        } else {
            // When the key matches, we add the data to the node's dataSet
            node.dataSet.add(data);
            // Ensure the valueToKeyMap also reflects this data-key relationship
            if (!this.valueToKeyMap.has(data)) {
                this.valueToKeyMap.set(data, new Set([key]));
            } else {
                // If the value already exists, just add the key to its set
                this.valueToKeyMap.get(data).add(key);
            }
        }

        // After insertion, update the node's height and rebalance the tree
        return this._updateNodeBalance(node);
    }

    deleteByValue(value) {
        if (!this.valueToKeyMap.has(value)) {
            console.log('Value does not exist in the tree.');
            return;
        }
        const keysToDelete = this.valueToKeyMap.get(value);
        keysToDelete.forEach(key => {
            this.delete(key, value);
        });
    }

    delete(key, value = null) {
        this.root = this._deleteRec(this.root, key, value);
    }

    _deleteRec(node, key, value) {
        if (node === null) return null;

        if (key < node.key) {
            node.left = this._deleteRec(node.left, key, value);
        } else if (key > node.key) {
            node.right = this._deleteRec(node.right, key, value);
        } else {
            if (value !== null) {
                if (node.dataSet.has(value)) {
                    node.dataSet.delete(value);
                    let valueKeys = this.valueToKeyMap.get(value);
                    if (valueKeys) {
                        valueKeys.delete(key);
                        if (valueKeys.size === 0) {
                            this.valueToKeyMap.delete(value);
                        }
                    }
                    if (node.dataSet.size > 0) return node;
                } else {
                    return node;
                }
            }
            // Node with only one child or no child
            if (!node.left || !node.right) {
                let temp = node.left ? node.left : node.right;
                if (!temp) {
                    temp = node;
                    node = null;
                } else {
                    node = temp;
                }
            } else {
                let temp = this._minValueNode(node.right);
                node.key = temp.key;
                node.dataSet = new Set(temp.dataSet);
                node.right = this._deleteRec(node.right, temp.key, null);
                if (node.dataSet.size > 0) {
                    this.valueToKeyMap.get(Array.from(node.dataSet)[0]).add(node.key);
                }
            }
        }

        if (node === null) return node;

        return this._updateNodeBalance(node);
    }

    _updateNodeBalance(node) {
        node.height = 1 + Math.max(this._getHeight(node.left), this._getHeight(node.right));
        let balance = this._getBalance(node);

        if (balance > 1 && this._getBalance(node.left) >= 0) {
            return this._rotateRight(node);
        }

        if (balance > 1 && this._getBalance(node.left) < 0) {
            node.left = this._rotateLeft(node.left);
            return this._rotateRight(node);
        }

        if (balance < -1 && this._getBalance(node.right) <= 0) {
            return this._rotateLeft(node);
        }

        if (balance < -1 && this._getBalance(node.right) > 0) {
            node.right = this._rotateRight(node.right);
            return this._rotateLeft(node);
        }

        return node;
    }

    _minValueNode(node) {
        let current = node;
        while (current.left != null) {
            current = current.left;
        }
        return current;
    }

    _getHeight(node) {
        if (node === null) return 0;
        return node.height;
    }

    _getBalance(node) {
        if (node === null) return 0;
        return this._getHeight(node.left) - this._getHeight(node.right);
    }

    _rotateRight(y) {
        let x = y.left;
        let T2 = x.right;
        x.right = y;
        y.left = T2;
        y.height = 1 + Math.max(this._getHeight(y.left), this._getHeight(y.right));
        x.height = 1 + Math.max(this._getHeight(x.left), this._getHeight(x.right));
        return x;
    }

    _rotateLeft(x) {
        let y = x.right;
        let T2 = y.left;
        y.left = x;
        x.right = T2;
        x.height = 1 + Math.max(this._getHeight(x.left), this._getHeight(x.right));
        y.height = 1 + Math.max(this._getHeight(y.left), this._getHeight(y.right));
        return y;
    }

    inOrderTraversal() {
        let result = [];
        this._inOrderTraversalRec(this.root, result);
        return result;
    }

    _inOrderTraversalRec(node, result) {
        if (node !== null) {
            this._inOrderTraversalRec(node.left, result);
            node.dataSet.forEach(data => result.push({ key: node.key, data }));
            this._inOrderTraversalRec(node.right, result);
        }
    }

    reverseOrderTraversal() {
        let result = [];
        this._reverseOrderTraversalRec(this.root, result);
        return result;
    }

    _reverseOrderTraversalRec(node, result) {
        if (node !== null) {
            this._reverseOrderTraversalRec(node.right, result);
            node.dataSet.forEach(data => result.push({ key: node.key, data }));
            this._reverseOrderTraversalRec(node.left, result);
        }
    }
}

module.exports = AVLTree;