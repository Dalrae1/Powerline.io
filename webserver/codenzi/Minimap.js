var Minimap = function() {
	var margin = 20;
	var mapSide = 120;
	var mapBorder = 20;
	var detail = 256;
	var mapInfo = [];
	var barriers = [];  // Array to store barriers
	var preRenderedColliderCanvas;
	var lastZoomAdjust = 0;

	this.addBarrier = function(x, y, width, height) {
		barriers.push({x: x, y: y, width: width, height: height});
	};
	this.clearBarriers = function() {
		barriers = [];
	}

	this.radiusFromMinimapRadiusPerc = function(perc) {
		var radius = 3 + perc * 8.0;
		var mapPerc = 8000 / arenaWidth;
		radius *= mapPerc;
		return radius;
	};

	this.radiusToMinimapRadius = function(radius) {
		var radiusPerc = (radius - 1) / (54.0 * GAME_SCALE);
		return this.radiusFromMinimapRadiusPerc(radiusPerc);
	};

	this.draw = function(context) {
		var mapX = screenWidth - mapSide * zoomAdjust - margin * zoomAdjust;
		var mapY = screenHeight - mapSide * zoomAdjust - margin * zoomAdjust;

		context.save();

		var needsPreRender = (zoomAdjust != lastZoomAdjust);
		lastZoomAdjust = zoomAdjust;

		// Draw Colliders
		if (!preRenderedColliderCanvas || needsPreRender) {
			this.preRenderColliders();
		}
		context.drawImage(preRenderedColliderCanvas, mapX - mapBorder * zoomAdjust, mapY - mapBorder * zoomAdjust);

		// Draw player pos
		if (localPlayer && localPlayer.renderedPoints != undefined) {
			var points = localPlayer.renderedPoints;
			var mapPoints = [];
			var count = points.length;
			for (var i = 0; i < count; i++) {
				var x = points[i].x + arenaWidth / 2.0 - arenaCenterX;
				var y = points[i].y + arenaHeight / 2.0 - arenaCenterY;
				var posPercX = x / arenaWidth;
				var posPercY = y / arenaHeight;
				mapPoints.push({x: posPercX, y: posPercY});
			}

			context.strokeStyle = 'hsl(' + localPlayer.hue + ', 100%, 50%)';
			context.lineWidth = 2;

			var drawCount = mapPoints.length;

			var x = mapPoints[0].x;
			var y = mapPoints[0].y;
			context.beginPath();
			context.moveTo(mapX + x * mapSide * zoomAdjust, mapY + y * mapSide * zoomAdjust);
			for (var i = 1; i < drawCount; i++) {
				x = mapPoints[i].x;
				y = mapPoints[i].y;
				context.lineTo(mapX + x * mapSide * zoomAdjust, mapY + y * mapSide * zoomAdjust);
			}
			context.stroke();

			if (kingID > 0) {
				var x = kingPosition.x + arenaWidth / 2.0 - arenaCenterX;
				var y = kingPosition.y + arenaHeight / 2.0 - arenaCenterY;
				var posPercX = x / arenaWidth;
				var posPercY = y / arenaHeight;
				context.translate(mapX + posPercX * mapSide * zoomAdjust, mapY + posPercY * mapSide * zoomAdjust);

				context.scale(0.5, 0.5);
				resources.frames.crown.draw(context);
			}
		}
		context.restore()
		// Render Barriers
		context.fillStyle = '#0555FF';
		barriers.forEach(function(barrier) {
			var x = (barrier.x + arenaWidth / 2 - arenaCenterX) / arenaWidth * mapSide * zoomAdjust;
			var y = (barrier.y + arenaHeight / 2 - arenaCenterY) / arenaHeight * mapSide * zoomAdjust;
			var width = (barrier.width / arenaWidth) * mapSide * zoomAdjust;
			var height = (barrier.height / arenaHeight) * mapSide * zoomAdjust;
			context.fillRect(mapX + x - width / 2, mapY + y - height / 2, width, height);
		});
		context.restore();
	};

	this.update = function(dt) {
	};

	this.updateBoundaries = function() {
	};

	this.preRenderColliders = function() {

		preRenderedColliderCanvas = document.createElement('canvas');
		var ctx = preRenderedColliderCanvas.getContext('2d');

		preRenderedColliderCanvas.width = (mapSide + mapBorder * 2) * zoomAdjust;
		preRenderedColliderCanvas.height = (mapSide + mapBorder * 2) * zoomAdjust;

		// Render Boundaries
		ctx.lineWidth = 4;
		ctx.strokeStyle = '#00ffff';
		ctx.fillStyle = '#002222';
		
		ctx.shadowBlur = 10;
		ctx.shadowColor = '#00ffff';

		ctx.beginPath();
		ctx.rect(mapBorder * zoomAdjust, mapBorder * zoomAdjust, mapSide * zoomAdjust, mapSide * zoomAdjust);
		ctx.stroke();
		ctx.globalAlpha = 0.5;
		ctx.shadowBlur = 0;
		ctx.fill();
		ctx.globalAlpha = 1.0;
	};
};