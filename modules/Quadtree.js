globalEntityQuads = {};

class Quadtree {
  constructor(boundary, capacity = 10) {
    this.boundary = boundary; // { x, y, width, height }
    this.capacity = capacity;
    this.entities = {};
    this.entityCount = 0; // To keep track of the number of entities
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


    if (this.entityCount < this.capacity) {
      this.entities[entity.id] = entity;
      this.entityCount++;

      if (!globalEntityQuads[entity.server.id]) {
        globalEntityQuads[entity.server.id] = {};
      }
  
      globalEntityQuads[entity.server.id][entity.id] = this;

      return true;
    } else {
      if (!this.divided) {
        this.subdivide();
      }

      if (this.northwest.insert(entity)) return true;
      if (this.northeast.insert(entity)) return true;
      if (this.southwest.insert(entity)) return true;
      if (this.southeast.insert(entity)) return true;
    }

    return false;
  }

  inBoundary(position) {
    const halfWidth = this.boundary.width / 2;
    const halfHeight = this.boundary.height / 2;
    const centerX = this.boundary.x + halfWidth;
    const centerY = this.boundary.y + halfHeight;
  
    return position.x >= (centerX - halfWidth) && position.x <= (centerX + halfWidth) &&
           position.y >= (centerY - halfHeight) && position.y <= (centerY + halfHeight);
  }

  delete(entity) {
    let serverEntities = globalEntityQuads[entity.server.id];
    if (!serverEntities) {
      return "Server not found in globalEntityQuads";
    }

    let serverQuad = serverEntities[entity.id];
    if (!serverQuad) {
      return "Entity not found in globalEntityQuads";
    }

    if (!serverQuad.entities[entity.id]) {
      return "Entity not found in serverQuad";
    }

    // Remove the entity from the specific quadtree node
    delete serverQuad.entities[entity.id];
    serverQuad.entityCount--;

    // Remove the entity from the global mapping
    delete globalEntityQuads[entity.server.id][entity.id];

    // Optionally clean up empty nodes
    serverQuad.cleanup();

    return true;
  }

  cleanup() {
    if (this.divided) {
      if (this.northwest.isEmpty() && this.northeast.isEmpty() &&
          this.southwest.isEmpty() && this.southeast.isEmpty()) {
        this.northwest = null;
        this.northeast = null;
        this.southwest = null;
        this.southeast = null;
        this.divided = false;
      }
    }
  }

  isEmpty() {
    return this.entityCount === 0 && (!this.divided ||
           (this.northwest.isEmpty() && this.northeast.isEmpty() &&
            this.southwest.isEmpty() && this.southeast.isEmpty()));
  }

  query(range, found = []) {
    if (!this.intersects(range)) {
      return found;
    }

    for (let id in this.entities) {
      let entity = this.entities[id];
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