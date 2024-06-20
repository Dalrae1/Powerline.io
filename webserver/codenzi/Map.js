function GetDistanceFromBarrier(pos, barrier) {
	let x = pos.x;
	let y = pos.y;
	let x1 = barrier.x - barrier.width / 2;
	let x2 = barrier.x + barrier.width / 2;
	let y1 = barrier.y - barrier.height / 2;
	let y2 = barrier.y + barrier.height / 2;
	if (x < x1) {
		if (y < y1) {
			return Math.sqrt((x1 - x) * (x1 - x) + (y1 - y) * (y1 - y));
		}
		if (y > y2) {
			return Math.sqrt((x1 - x) * (x1 - x) + (y2 - y) * (y2 - y));
		}
		return x1 - x;
	}
	if (x > x2) {
		if (y < y1) {
			return Math.sqrt((x2 - x) * (x2 - x) + (y1 - y) * (y1 - y));
		}
		if (y > y2) {
			return Math.sqrt((x2 - x) * (x2 - x) + (y2 - y) * (y2 - y));
		}
		return x - x2;
	}
	if (y < y1) {
		return y1 - y;
	}
	if (y > y2) {
		return y - y2;
	}
	return 0;

}


var Mapp = function() {
	var map = this;

	var scale = 10.0;

	var outsideTimer = 0;

	// Side Limit
	var preRenderedSideLines = false;
	var verticalSideLineCanvas;
	var horizontalSideLineCanvas;
	var shadowBlur = 9;
	var lineWidth = 5;

	var sideLimit = null;

	var barriers = [];  // Array to store barriers

	this.addBarrier = function(x, y, width, height) {
		barriers.push({ x: x, y: y, width: width, height: height });
	};
	this.clearBarriers = function() {
		barriers = [];
	}

	this.preRenderSideLine = function(vertical) {
		var lineStyle = '#0555FF';
		var preRenderedCanvas = document.createElement('canvas');
		var ctx = preRenderedCanvas.getContext('2d');

		var thickness, m2;
		thickness = shadowBlur * 2.0;
		if (vertical) {
			preRenderedCanvas.width = thickness;
			preRenderedCanvas.height = sideLimit * 2 + shadowBlur * 2.0;
		} else {
			preRenderedCanvas.width = sideLimit * 2 + shadowBlur * 2.0;
			preRenderedCanvas.height = thickness;
		}

		ctx.strokeStyle = lineStyle;
		ctx.beginPath();
		ctx.lineCap = 'round';

		ctx.moveTo(shadowBlur, shadowBlur);

		if (vertical)
			ctx.lineTo(shadowBlur, shadowBlur + sideLimit * 2);
		else
			ctx.lineTo(shadowBlur + sideLimit * 2, shadowBlur);
		ctx.shadowColor = lineStyle;
		ctx.shadowBlur = shadowBlur;
		ctx.strokeStyle = '#AAFFFF';
		ctx.lineWidth = lineWidth * 0.9;
		ctx.stroke();
		return preRenderedCanvas;
	};

	this.preRenderSideLines = function() {
		verticalSideLineCanvas = this.preRenderSideLine(true);
		horizontalSideLineCanvas = this.preRenderSideLine(false);
		preRenderedSideLines = true;
	};

	this.drawLimits = function(context) {
		var sideAfterWidth = 250 * GAME_SCALE;
		var afterHeight = 250 * GAME_SCALE;

		var boundaryHeight = arenaHeight * 2.0;

		var style = '#023139';
		var bounds = camera.getBounds();

		var thickness = 100 * GAME_SCALE;
		var firstSet = (dstSideLimit == null);
		var dstSideLimit = arenaWidth / 2.0;
		if (sideLimit == null) {
			sideLimit = dstSideLimit;
		} else {
			var inc = (dstSideLimit - sideLimit) / 20.0;
			var ainc = Math.abs(inc);
			if (ainc < 1.0 && ainc > 0.001)
				ainc = 1.0;
			if (ainc > 0.001) {
				sideLimit += inc;
				this.preRenderSideLines();
			}
		}

		if (!preRenderedSideLines) {
			this.preRenderSideLines();
		}
		context.save();
		context.translate(arenaCenterX, arenaCenterY);
		if (sideLimit + arenaCenterX <= bounds[1].x) {
			context.fillStyle = style;
			context.fillRect(sideLimit, -sideLimit - thickness, thickness, thickness * 2.0 + sideLimit * 2.0);
		}

		if (-sideLimit + arenaCenterX >= bounds[0].x) {
			context.fillStyle = style;
			context.fillRect(-sideLimit - thickness, -sideLimit - thickness, thickness, thickness * 2.0 + sideLimit * 2.0);
		}

		if (-arenaHeight / 2.0 + arenaCenterY > bounds[0].y) {
			context.fillStyle = style;
			context.fillRect(-sideLimit - 2, -sideLimit - thickness, sideLimit * 2.0 + 4, thickness);
		}

		if (arenaHeight / 2.0 + arenaCenterY < bounds[1].y) {
			context.fillStyle = style;
			context.fillRect(-sideLimit - 2, sideLimit, sideLimit * 2.0 + 4, thickness);
		}

		if (1) {
			if (sideLimit + arenaCenterX <= bounds[1].x) {
				context.drawImage(verticalSideLineCanvas, sideLimit - shadowBlur, -sideLimit - shadowBlur);
			}

			if (-sideLimit + arenaCenterX >= bounds[0].x) {
				context.drawImage(verticalSideLineCanvas, -sideLimit - shadowBlur, -sideLimit - shadowBlur);
			}

			if (-arenaHeight / 2.0 + arenaCenterY > bounds[0].y) {
				context.drawImage(horizontalSideLineCanvas, -sideLimit - shadowBlur, -sideLimit - shadowBlur);
			}

			if (arenaHeight / 2.0 + arenaCenterY < bounds[1].y) {
				context.drawImage(horizontalSideLineCanvas, -sideLimit - shadowBlur, sideLimit - shadowBlur);
			}
		}
		context.restore();
	};

	this.draw = function(context) {
		var bounds = camera.getBounds();
		var z = 1.0 / camera.zoom;
		context.save();
		context.globalCompositeOperation = 'source-over';
		context.fillStyle = resources.bgGrid;
		var s = 0.65;
		context.scale(s, s);
		context.fillRect(bounds[0].x / s, bounds[0].y / s, canvas.width * z / s, canvas.height * z / s);

		// Draw barriers
		context.fillStyle = '#023139';
		barriers.forEach(function(barrier) {
			var x = barrier.x/s;
			var y = barrier.y/s;

			if (!localPlayer) return;

			let closestPoint = GetDistanceFromBarrier({x: localPlayer.x, y: localPlayer.y}, barrier);

			if (closestPoint > 500)
				return 

			for (var i=0; i<4; i++) {
				context.save()

				let vertical = (i % 2 == 0);
				var lineStyle = '#0555FF';
				let thickness = shadowBlur * 2.0;
				context.strokeStyle = lineStyle;
				context.beginPath();
				context.lineCap = 'round';

				switch (i) {
					case 0: // Right Side
						context.moveTo(x + (barrier.width/2)/s, y - (barrier.height/2)/s);
						context.lineTo(x + (barrier.width/2)/s, y + (barrier.height/2)/s);
						break;
					case 1: // Left Side
						context.moveTo(x - (barrier.width/2)/s, y - (barrier.height/2)/s);
						context.lineTo(x - (barrier.width/2)/s, y + (barrier.height/2)/s);
						break;
					case 2: // Top Side
						context.moveTo(x - (barrier.width/2)/s, y - (barrier.height/2)/s);
						context.lineTo(x + (barrier.width/2)/s, y - (barrier.height/2)/s);
						break;
					case 3: // Bottom Side
						context.moveTo(x - (barrier.width/2)/s, y + (barrier.height/2)/s);
						context.lineTo(x + (barrier.width/2)/s, y + (barrier.height/2)/s);
						break;
				}
				context.shadowColor = lineStyle;
				context.shadowBlur = shadowBlur;
				context.strokeStyle = '#AAFFFF';
				context.lineWidth = lineWidth * 0.9;
				context.stroke();

				

				context.restore()
			}
			context.fillRect((x - (barrier.width/2)/s)+(shadowBlur/2), (y - (barrier.height/2)/s)+(shadowBlur/2), (barrier.width/s)-(shadowBlur), (barrier.height/s)-(shadowBlur));
		});
		
		context.restore();
	};

	var updatedOnce = false;
	this.update = function(dt) {
		if (!firstClick && updatedOnce) {
			return;
		}
		updatedOnce = true;
	};
}