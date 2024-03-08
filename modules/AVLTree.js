class Node {
    constructor(key, data) {
        this.key = key;
        this.dataSet = new Set([data]); // Use a Set to store multiple values
        this.left = null;
        this.right = null;
        this.height = 1;
    }
}

class AVLTree {
    constructor() {
        this.root = null;
        this.valueToKeyMap = new Map(); // Map to store reverse mapping from value to key
    }

    insert(key, data) {
        this.root = this._insertRec(this.root, key, data);
        // Update reverse mapping
        if (!this.valueToKeyMap.has(data)) {
            this.valueToKeyMap.set(data, new Set([key]));
        } else {
            this.valueToKeyMap.get(data).add(key);
        }
    }

    _insertRec(node, key, data) {
        if (node === null) {
            return new Node(key, data);
        }

        if (key < node.key) {
            node.left = this._insertRec(node.left, key, data);
        } else if (key > node.key) {
            node.right = this._insertRec(node.right, key, data);
        } else {
            // Duplicate keys are allowed, add data to existing node
            node.dataSet.add(data);
            return node;
        }

        node.height = 1 + Math.max(this._getHeight(node.left), this._getHeight(node.right));
        
        let balance = this._getBalance(node);

        // Left Left Case
        if (balance > 1 && key < node.left.key) {
            return this._rotateRight(node);
        }

        // Right Right Case
        if (balance < -1 && key > node.right.key) {
            return this._rotateLeft(node);
        }

        // Left Right Case
        if (balance > 1 && key > node.left.key) {
            node.left = this._rotateLeft(node.left);
            return this._rotateRight(node);
        }

        // Right Left Case
        if (balance < -1 && key < node.right.key) {
            node.right = this._rotateRight(node.right);
            return this._rotateLeft(node);
        }

        return node;
    }

    delete(key, value) {
        this.root = this._deleteRec(this.root, key, value);
    }

    _deleteRec(node, key, value) {
        if (node === null) {
            return null;
        }

        // Traverse the tree to find the node with the key (score) to delete
        if (key < node.key) {
            node.left = this._deleteRec(node.left, key, value);
        } else if (key > node.key) {
            node.right = this._deleteRec(node.right, key, value);
        } else {
            // Node with the matching key (score) found
            // Check if this node contains the specific player's ID in its dataSet
            if (node.dataSet.has(value)) {
                // Remove only the specific player's ID from the dataSet
                node.dataSet.delete(value);
                // Update reverse mapping
                let valueKeySet = this.valueToKeyMap.get(value);
                if (valueKeySet) {
                    valueKeySet.delete(node.key);
                    if (valueKeySet.size === 0) {
                        this.valueToKeyMap.delete(value);
                    }
                }
            }

            // If the dataSet is now empty after removal, proceed to delete the node
            if (node.dataSet.size === 0) {
                // Node to be deleted has no children or one child
                if (node.left === null || node.right === null) {
                    let temp = node.left ? node.left : node.right;

                    // No child case
                    if (temp === null) {
                        temp = node;
                        node = null;
                    } else {
                        // One child case
                        node = temp;
                    }
                } else {
                    // Node to be deleted has two children
                    let temp = this._minValueNode(node.right);

                    // Copy the inorder successor's data and dataSet to this node
                    node.key = temp.key;
                    node.dataSet = new Set(temp.dataSet);
                    // Delete the inorder successor
                    node.right = this._deleteRec(node.right, temp.key, temp.dataSet.values().next().value);
                }
            }
        }

        if (node === null) return null;

        // Update height of the current node
        node.height = 1 + Math.max(this._getHeight(node.left), this._getHeight(node.right));

        // Balance the tree
        return this._balanceNode(node);
    }

    _balanceNode(node) {
        let balance = this._getBalance(node);

        // Left Left Case
        if (balance > 1 && this._getBalance(node.left) >= 0) {
            return this._rotateRight(node);
        }

        // Left Right Case
        if (balance > 1 && this._getBalance(node.left) < 0) {
            node.left = this._rotateLeft(node.left);
            return this._rotateRight(node);
        }

        // Right Right Case
        if (balance < -1 && this._getBalance(node.right) <= 0) {
            return this._rotateLeft(node);
        }

        // Right Left Case
        if (balance < -1 && this._getBalance(node.right) > 0) {
            node.right = this._rotateRight(node.right);
            return this._rotateLeft(node);
        }

        return node;
    }

    _minValueNode(node) {
        let current = node;
        while (current.left !== null) {
            current = current.left;
        }
        return current;
    }

    inOrderTraversal() {
        let result = [];
        this._inOrderTraversalRec(this.root, result);
        return result;
    }

    _inOrderTraversalRec(node, result) {
        if (node !== null) {
            this._inOrderTraversalRec(node.left, result);
            for (let value of node.dataSet) {
                result.push({ key: node.key, data: value });
            }
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
            for (let value of node.dataSet) {
                result.push({ key: node.key, data: value });
            }
            this._reverseOrderTraversalRec(node.left, result);
        }
    }

    _getHeight(node) {
        return node ? node.height : 0;
    }

    _getBalance(node) {
        return node ? this._getHeight(node.left) - this._getHeight(node.right) : 0;
    }

    _rotateRight(y) {
        let x = y.left;
        let T2 = x.right;

        // Perform rotation
        x.right = y;
        y.left = T2;

        // Update heights
        y.height = 1 + Math.max(this._getHeight(y.left), this._getHeight(y.right));
        x.height = 1 + Math.max(this._getHeight(x.left), this._getHeight(x.right));

        // Return new root
        return x;
    }

    _rotateLeft(x) {
        let y = x.right;
        let T2 = y.left;

        // Perform rotation
        y.left = x;
        x.right = T2;

        // Update heights
        x.height = 1 + Math.max(this._getHeight(x.left), this._getHeight(x.right));
        y.height = 1 + Math.max(this._getHeight(y.left), this._getHeight(y.right));

        // Return new root
        return y;
    }

    // Method to get keys based on a value
    getKeysByValue(value) {
        if (this.valueToKeyMap.has(value)) {
            return Array.from(this.valueToKeyMap.get(value));
        }
        return [];
    }

    lookupPosition(value) {
        return this._lookupPositionRec(this.root, value);
    }

    _lookupPositionRec(node, value) {
        if (node === null) {
            return null; // Value not found
        }

        // Check if the value is in the current node's dataSet
        if (node.dataSet.has(value)) {
            return { key: node.key, position: Array.from(node.dataSet).indexOf(value) + 1 }; // Position is 1-indexed
        }

        // Recursively search left subtree
        let leftResult = this._lookupPositionRec(node.left, value);
        if (leftResult !== null) {
            return leftResult;
        }

        // Recursively search right subtree
        let rightResult = this._lookupPositionRec(node.right, value);
        if (rightResult !== null) {
            return rightResult;
        }

        return null; // Value not found in the tree
    }

    lookupReversePosition(value) {
        let result = this._lookupReversePositionRec(this.root, value, { position: 0, found: false });
        if (result !== null) {
            return { key: result.key, position: result.position };
        } else {
            return null;
        }
    }

    _lookupReversePositionRec(node, value, info) {
        if (node === null) {
            return null; // Value not found
        }

        // Traverse right subtree
        let rightResult = this._lookupReversePositionRec(node.right, value, info);
        if (rightResult !== null) {
            return rightResult;
        }

        // Check if the value is in the current node's dataSet
        if (node.dataSet.has(value)) {
            // Update the position from the end
            info.position = info.position + node.dataSet.size - Array.from(node.dataSet).indexOf(value);
            info.found = true;
            return info;
        }

        // Traverse left subtree
        let leftResult = this._lookupReversePositionRec(node.left, value, info);
        if (leftResult !== null) {
            return leftResult;
        }

        // If the value is not found in the subtrees, update position and return
        info.position += node.dataSet.size;
        return info.found ? null : info;
    }
}

module.exports = AVLTree;