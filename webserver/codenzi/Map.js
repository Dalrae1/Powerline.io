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

	this.preRenderSideLine = function(vertical)
	{
		var lineStyle = '#0555FF';
		var preRenderedCanvas = document.createElement('canvas');
		var ctx = preRenderedCanvas.getContext('2d');

		var thickness, m2;
		thickness = shadowBlur*2.0;
		if(vertical)
		{
			preRenderedCanvas.width = thickness;
			preRenderedCanvas.height = sideLimit*2 + shadowBlur*2.0;
		}else{
			preRenderedCanvas.width = sideLimit*2 + shadowBlur*2.0;
			preRenderedCanvas.height = thickness;
		}

		ctx.strokeStyle = lineStyle;
		ctx.beginPath();
		ctx.lineCap = 'round';

		ctx.moveTo(shadowBlur, shadowBlur);

		if(vertical)
			ctx.lineTo(shadowBlur, shadowBlur+sideLimit*2);
		else
			ctx.lineTo(shadowBlur+sideLimit*2, shadowBlur);
		ctx.shadowColor = lineStyle;
		ctx.shadowBlur = shadowBlur;
		//ctx.lineWidth = lineWidth;
		//ctx.stroke();

		ctx.strokeStyle = '#AAFFFF';
		ctx.lineWidth = lineWidth*0.9;
		ctx.stroke();
		return preRenderedCanvas;
	};

	/*
	this.preRenderSideLineNew = function(vertical)
	{
		var lineStyle = '#05ff05';
		var preRenderedCanvas = document.createElement('canvas');
		var ctx = preRenderedCanvas.getContext('2d');

		var thickness = wallStretchFrame.width;
		if(vertical)
		{
			preRenderedCanvas.width = thickness;
			preRenderedCanvas.height = arenaHeight;
			ctx.translate(wallStretchFrame.width/2.0, 0);
			ctx.scale(1, arenaHeight*2.0);
			wallStretchFrame.draw(ctx);
		}else{
			preRenderedCanvas.width = arenaWidth;
			preRenderedCanvas.height = thickness;

			ctx.translate(0, wallStretchFrame.width/2.0);
			ctx.scale(arenaHeight*2.0, 1);
			ctx.rotate(Math.PI/2.0);
			wallStretchFrame.draw(ctx);
		}

		return preRenderedCanvas;
	};
	*/

	this.preRenderSideLines = function()
	{
		verticalSideLineCanvas = this.preRenderSideLine(true);
		horizontalSideLineCanvas = this.preRenderSideLine(false);
		preRenderedSideLines = true;
	};

	this.drawLimits = function(context) {
		var sideAfterWidth = 250*GAME_SCALE;
		var afterHeight = 250*GAME_SCALE;

		var boundaryHeight = arenaHeight*2.0;

		//var alpha = 0.4;
		//var style = 'rgba(0,100,200,'+alpha+')';
		var style = '#023139';
		var bounds = camera.getBounds();

		var thickness = 100*GAME_SCALE;
		var firstSet = (dstSideLimit==null);
		var dstSideLimit = arenaWidth / 2.0;
		if(sideLimit == null)
		{
			sideLimit = dstSideLimit;
		}else{
			var inc = (dstSideLimit - sideLimit)/20.0;
			var ainc = Math.abs(inc);
			if(ainc < 1.0 && ainc > 0.001)
				ainc = 1.0;
			if(ainc > 0.001)
			{
				sideLimit += inc;
				//console.log('sideLimit: ' + sideLimit + ', inc: ' + inc);
				this.preRenderSideLines();
			}
		}
		//boundaryHeight = sideLimit*4.0;

		if(!preRenderedSideLines)
		{
			this.preRenderSideLines();
		}
		context.save();
		context.translate(arenaCenterX, arenaCenterY);
		if(sideLimit+arenaCenterX <= bounds[1].x)
		{
			context.fillStyle = style;
			context.fillRect(sideLimit, -sideLimit-thickness, thickness, thickness*2.0+sideLimit*2.0);
		}
		
		if(-sideLimit+arenaCenterX >= bounds[0].x)
		{
			context.fillStyle=style;
			context.fillRect(-sideLimit - thickness, -sideLimit-thickness, thickness, thickness*2.0+sideLimit*2.0);
		}
		
		if(-arenaHeight/2.0+arenaCenterY > bounds[0].y)
		{
			context.fillStyle = style;
			context.fillRect(-sideLimit-2, -sideLimit-thickness, sideLimit*2.0+4, thickness);
		}
		
		if(arenaHeight/2.0+arenaCenterY < bounds[1].y)
		{
			context.fillStyle = style;
			context.fillRect(-sideLimit-2, sideLimit, sideLimit*2.0+4, thickness);
		}

		if(1){
			if(sideLimit+arenaCenterX <= bounds[1].x)
			{
				context.drawImage(verticalSideLineCanvas, sideLimit - shadowBlur, -sideLimit - shadowBlur);
			}

			if(-sideLimit+arenaCenterX >= bounds[0].x)
			{
				context.drawImage(verticalSideLineCanvas, -sideLimit - shadowBlur, -sideLimit - shadowBlur);
			}

			if(-arenaHeight/2.0+arenaCenterY > bounds[0].y)
			{
				context.drawImage(horizontalSideLineCanvas, -sideLimit - shadowBlur, -sideLimit - shadowBlur);
			}

			if(arenaHeight/2.0+arenaCenterY < bounds[1].y)
			{
				context.drawImage(horizontalSideLineCanvas, -sideLimit - shadowBlur, sideLimit - shadowBlur);
			}
		}
		context.restore();
	};

	this.draw = function(context) {
		var bounds = camera.getBounds();
		var z = 1.0/camera.zoom;
		context.save();
		context.globalCompositeOperation = 'source-over';
		context.fillStyle = resources.bgGrid;
		var s = 0.65;
		context.scale(s,s);
		context.fillRect(bounds[0].x/s, bounds[0].y/s, canvas.width * z / s, canvas.height * z / s);
		context.restore();
	};

	var updatedOnce = false;
	this.update = function(dt) {
		if(!firstClick && updatedOnce){
			return;
		}
		updatedOnce = true;
	};
}
