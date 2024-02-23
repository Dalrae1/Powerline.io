var Camera = function(aCanvas, aContext, x, y) {
	var camera = this;

	var canvas = aCanvas;
	var context = aContext;

	this.x = x;
	this.y = y;

	this.minZoom = 1.0;
	this.maxZoom = 2.0;
	this.zoom = this.minZoom;

	var followCameraPos = {x: 0,
						   y: 0}

	var cameraShiftValue = 1.5;
	var backgroundColor = 200;

	// Shake
	var shakeRemainingTime = 0.0;
	var shakePower;
    var randomAngleX = 0.0;
    var randomAngleY = 0.0;
    var shakeShiftX = 0.0;
    var shakeShiftY = 0.0;

    var camDist = 0.0;
    var curSX = 0.0;
    var curSY = 0.0;
    var hasDamping = false;
    var lastCamX = 0;
    var lastCamY = 0;

	this.setupContext = function(ctx) {
		var zoom = camera.zoom;
		// zoom *= 0.5; // Debug
		var translateX = canvas.width / 2 - camera.x * zoom;
		var translateY = canvas.height / 2 - camera.y * zoom;

		//console.log('X: '+camera.x+' Y:'+camera.y);

		// Reset transform matrix
		ctx.setTransform(1,0,0,1,0,0);
		ctx.translate(translateX+shakeShiftX, translateY+shakeShiftY);
		ctx.scale(zoom, zoom);
	};

	this.applyShake = function(dt) {
		if(!firstClick)
			return;

        // Shake
        if (shakeRemainingTime > 0.0){
            var radius = shakePower;
            if(shakeRemainingTime < 250)
            {
                radius = shakePower * ((shakeRemainingTime/1000) / 0.5);
            }
            randomAngleX += 1.0;
            randomAngleY += 1.1;
            var offsetX = Math.sin(randomAngleX) * (radius / 4.0);
            var offsetY = Math.cos(randomAngleY) * radius;

            shakeShiftX = offsetX;
            shakeShiftY = offsetY;
            shakeRemainingTime -= dt;
        }else{
        	shakeShiftX = 0;
        	shakeShiftY = 0;
        }
	};

	this.update = function(dt) {

		//var targetZoom = (camera.maxZoom + (camera.minZoom - camera.maxZoom));

		if(!firstClick)
		{
			camera.y = 0;
		}

		if(!isInGame && spectateMode == SPECTATE_FREE && !UIVisible)
		{
			/*
			targetZoom = 0.7*(1.0/(window.devicePixelRatio/defaultRetinaValue))*zoomAdjust;
			camera.zoom += (targetZoom - camera.zoom) / 10;
			this.applyShake(dt);
			*/
			return;
		}else{
			if(zoomOut)
				targetZoom = 0.6;
			gameZoom += (targetZoom - gameZoom) / 10;
			camera.zoom = (gameZoom*(10.0/GAME_SCALE)) * (1.0/(window.devicePixelRatio/defaultRetinaValue));
			camera.zoom *= zoomAdjust;
		}

		// No Damping
		var x = camera.x;
		var y = camera.y;
		if(localPlayer && !showBigPicture)
		{
			// Dont follow snap to collision point, looks ugly
			if(!localPlayer.beingDeleted)
			{
				x = localPlayer.x;
				y = localPlayer.y;
			}
			firstClick = true;
			if(killCount < KILLS_TO_FOLLOW)
				app.resetAlpha();

		}else{
			if(lastKillerID > 0)
			{
				var killer = entities[lastKillerID];
				if(killer)
				{
					x += (killer.x - x)/cameraSmooth;
					y += (killer.y - y)/cameraSmooth;
				}
			}
		}
		worldScreenDelta.x = x - camera.x;
		worldScreenDelta.y = y - camera.y;

		if(0)
		{
			camera.x += (x - camera.x)/10;
			camera.y += (y - camera.y)/10;
			lastCamX = x;
			lastCamY = y;
		}else{
			camera.x = x;
			camera.y = y;
		}

		this.applyShake(dt);
	};

	this.setPosition = function(_x, _y) {
		worldScreenDelta.x = _x - camera.x;
		worldScreenDelta.y = _y - camera.y;
		camera.x = _x;
		camera.y = _y;
	};

	this.shake = function(power) {
		if(!firstClick)
			return;
	    shakeRemainingTime = 500;
	    shakePower = power;
	};

	// Gets bounds of current zoom level of current position
	this.getBounds = function() {
		return [
			{x: camera.x - canvas.width / 2 / camera.zoom, y: camera.y - canvas.height / 2 / camera.zoom},
			{x: camera.x + canvas.width / 2 / camera.zoom, y: camera.y + canvas.height / 2 / camera.zoom}
		];
	};

	// Gets bounds of minimum zoom level of current position
	this.getOuterBounds = function() {
		return [
			{x: camera.x - canvas.width / 2 / camera.minZoom, y: camera.y - canvas.height / 2 / camera.minZoom},
			{x: camera.x + canvas.width / 2 / camera.minZoom, y: camera.y + canvas.height / 2 / camera.minZoom}
		];
	};

	// Gets bounds of maximum zoom level of current position
	this.getInnerBounds = function() {
		return [
			{x: camera.x - canvas.width / 2 / camera.maxZoom, y: camera.y - canvas.height / 2 / camera.maxZoom},
			{x: camera.x + canvas.width / 2 / camera.maxZoom, y: camera.y + canvas.height / 2 / camera.maxZoom}
		];
	};

	this.startUILayer = function() {
		context.setTransform(1,0,0,1,0,0);
	}

	/*
	this.setPos = function(_x, _y) {
		this.x = _x*GAME_SCALE;
		this.y = _y*GAME_SCALE;
	}
	*/

	var debugBounds = function(bounds, text) {
		context.strokeStyle   = '#fff';
		context.beginPath();
		context.moveTo(bounds[0].x, bounds[0].y);
		context.lineTo(bounds[0].x, bounds[1].y);
		context.lineTo(bounds[1].x, bounds[1].y);
		context.lineTo(bounds[1].x, bounds[0].y);
		context.closePath();
		context.stroke();
		context.fillText(text, bounds[0].x + 10, bounds[0].y + 10);
	};

	var drawDebug = function() {
		debugBounds(camera.getInnerBounds(), 'Maximum zoom camera bounds');
		//debugBounds(camera.getOuterBounds(), 'Minimum zoom camera bounds');
		//debugBounds(camera.getBounds(), 'Current zoom camera bounds');
	};
};
