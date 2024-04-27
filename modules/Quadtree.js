class Quadtree {
  constructor(boundary, capacity = 4) {
    this.boundary = boundary; // { x, y, width, height }
    this.capacity = capacity;
    this.entities = [];
    this.divided = false;
  }

  subdivide() {
    const x = this.boundary.x;
    const y = this.boundary.y;
    const w = this.boundary.width / 2;
    const h = this.boundary.height / 2;

    this.northwest = new Quadtree({ x: x, y: y, width: w, height: h }, this.capacity);
    this.northeast = new Quadtree({ x: x + w, y: y, width: w, height: h }, this.capacity);
    this.southwest = new Quadtree({ x: x, y: y + h, width: w, height: h }, this.capacity);
    this.southeast = new Quadtree({ x: x + w, y: y + h, width: w, height: h }, this.capacity);

    this.divided = true;
  }

  insert(entity) {
    if (!this.inBoundary(entity.position)) {
      return false; // Entity is out of the boundary
    }

    if (this.entities.length < this.capacity) {
      this.entities.push(entity);
      return true;
    } else {
      if (!this.divided) {
        this.subdivide();
      }

      return this.northwest.insert(entity) || this.northeast.insert(entity) ||
             this.southwest.insert(entity) || this.southeast.insert(entity);
    }
  }

  inBoundary(position) {
    // Check using half-widths and half-heights from the center
    const halfWidth = this.boundary.width / 2;
    const halfHeight = this.boundary.height / 2;
    const centerX = this.boundary.x + halfWidth;
    const centerY = this.boundary.y + halfHeight;

    return position.x >= (centerX - halfWidth) && position.x < (centerX + halfWidth) &&
           position.y >= (centerY - halfHeight) && position.y < (centerY + halfHeight);
  }

  delete(entity) {
    if (!this.inBoundary(entity.position)) {
      return false;
    }

    for (let i = 0; i < this.entities.length; i++) {
      if (this.entities[i].id === entity.id) {
        this.entities.splice(i, 1);
        return true;
      }
    }

    if (this.divided) {
      return this.northwest.delete(entity) || this.northeast.delete(entity) ||
             this.southwest.delete(entity) || this.southeast.delete(entity);
    }

    return false;
  }

  query(range, found = []) {
    if (!this.intersects(range)) {
      return found;
    }

    for (let entity of this.entities) {
      if (this.inRange(entity.position, range)) {
        found.push(entity);
      }
    }

    if (this.divided) {
      this.northwest.query(range, found);
      this.northeast.query(range, found);
      this.southwest.query(range, found);
      this.southeast.query(range, found);
    }

    return found;
  }

  inRange(position, range) {
    return position.x >= range.x &&
           position.x <= range.x + range.width &&
           position.y >= range.y &&
           position.y <= range.y + range.height;
  }

  intersects(range) {
    const centerX = this.boundary.x + this.boundary.width / 2;
    const centerY = this.boundary.y + this.boundary.height / 2;
    const halfWidth = this.boundary.width / 2;
    const halfHeight = this.boundary.height / 2;

    return !(range.x > (centerX + halfWidth) ||
             range.x + range.width < (centerX - halfWidth) ||
             range.y > (centerY + halfHeight) ||
             range.y + range.height < (centerY - halfHeight));
  }
}

module.exports = Quadtree;