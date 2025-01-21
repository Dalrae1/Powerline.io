var App = function(aCanvas) {
	var app = this;
	var OFFSCREEN_KING = 1;
	var offscreenInfo = [{}, {}];

	var canvas;
	var context;
	this.context = context;
	var arrowsAlpha = 0.0;
	var speedUpTutorialAlpha = 0.0;
	var speedupTutorial;
	var alpha = 1.0;
	var fadeOut = false;

	app.update = function(dt) {
		if(localPlayer && !localPlayer.inGame && spectateMode == SPECTATE_FOLLOW){
			localPlayer = null;
		}

		if(hud)
			hud.update(dt);

		laserExists = false;

		var currentTopPlayer = null;

		// Update players
		for(var id in entities) {
			var entity = entities[id];
			if(!entity.tutorial)
			{
				entity.update(dt);
				if(id == localPlayerID)
				{
					localPlayer = entities[id];
				}
			}
		}
		justTurned = false;
		
		// Update Camera
		camera.update(dt);

		animationManager.update(dt);

		worldScreenCenter = {
			x: (canvas.width/2 + (camera.x * camera.zoom - canvas.width / 2)) / camera.zoom,
			y: (canvas.height/2 + (camera.y * camera.zoom  - canvas.height / 2)) / camera.zoom
		}

		// Transition Smoothness To Killer Camera
		if(lastKillerID > 0 && cameraSmooth > 1.0)
		{
			cameraSmooth -= 0.2;
			if(cameraSmooth < 1.0)
				cameraSmooth = 1.0;
		}

		map.update(dt);
		minimap.update(dt);

		if(kingID > 0)
			this.updateOffscreenInfo(OFFSCREEN_KING);

		if(!arrows && !UIVisible)
		{
			arrowsAlpha += (dt/1000)*3.0;
			if(arrowsAlpha > 1.0)
				arrowsAlpha = 1.0;
		}else if(arrows == 1 && arrowsAlpha > 0)
		{
			arrowsAlpha -= (dt/1000)*3.0;
			if(arrowsAlpha <= 0.0)
				arrowsAlpha = 0.0;
		}
		if(arrows == 1)
		{
			if((!inGameSpeedTutorial || spacePressedShowTutorialTime > 0) && !UIVisible)
			{
				spacePressedShowTutorialTime -= dt;
				if(spacePressedShowTutorialTime < 0.0)
					spacePressedShowTutorialTime = 0;

				speedUpTutorialAlpha += (dt/1000)*3.0;
				if(speedUpTutorialAlpha > 1.0)
					speedUpTutorialAlpha = 1.0;
			}else if(inGameSpeedTutorial == 1 && speedUpTutorialAlpha > 0)
			{
				speedUpTutorialAlpha -= (dt/1000)*3.0;
				if(speedUpTutorialAlpha <= 0.0)
					speedUpTutorialAlpha = 0.0;			
			}
		}

		if(speedupTutorial.isInitialized)
			speedupTutorial.update(dt);

		if(fadeOut)
		{
			alpha -= 0.01;
			if(alpha < 0)
				alpha = 0;
		}
	};

	app.draw = function(dt) {

		if(!resources.loaded)
			return;

		camera.setupContext(context);

		map.draw(context);

		if(!receivedConfig)
			return;

		//drawGrid(context);
		if(firstClick)
		{
			// Draw Entities
			for(var id in entities) {
				var entity = entities[id];
				if(!entity.tutorial)
				{
					entity.setAlpha(alpha);
					entity.draw(context, dt);
				}
			}

			for(var id in entities) {
				var entity = entities[id];
				if(!entity.tutorial)
				{
					entity.drawAfter(context, dt);
				}
			}

			// Draw Player Info
			for(var id in entities) {
				entities[id].drawInfo(context);
			}
			animationManager.drawBehind(context);
		}

		if(firstClick)
		{
			// Animations
			animationManager.drawLayer2(context);
			animationManager.draw(context);

			animationManager.drawExplosions(context);
			effects.draw(context);


			map.drawLimits(context);
		}

		if(isInGame && localPlayer)
		{
			localPlayer.drawInput(context);
		}

		// Draw Vision Boundaries
		if(localPlayer && drawBoundaries){
			var x = localPlayer.x;
			var y = localPlayer.y;
			context.save();

			var w = screenWidth*visionPerc / camera.zoom;
			var h = screenHeight*visionPerc / camera.zoom;

			context.beginPath();
			context.strokeStyle = '#FFFFFF';
			context.rect(x-w/2,y-h/2,w, h);
			context.stroke();
			context.closePath();
			context.restore();
		}
		if (localPlayer && debugCircle) {
			Object.values(debugCircle).forEach((circle) => {
				context.beginPath();
				context.arc(circle.x*GAME_SCALE, -circle.y*GAME_SCALE, circle.size, 0, 2 * Math.PI, false);
				context.fillStyle = 'hsl('+circle.hue+', 100%, 50%)';
				context.fill();

			})
		}

		// Draw Offscreen Info
		if(kingID > 0)
			this.drawOffscreenInfo(context, OFFSCREEN_KING);

		// Start UI layer (reset transform matrix)
		camera.startUILayer();

		if(speedupTutorial.isInitialized)
			speedupTutorial.draw(context);

		if(arrowsAlpha > 0.0 && !UIVisible && resources.keysImage)
		{
			context.save();
			context.globalAlpha = arrowsAlpha;
			context.scale(zoomAdjust, zoomAdjust);
			context.translate(screenWidth*0.5/zoomAdjust, screenHeight*0.825/zoomAdjust);
			context.drawImage(resources.keysImage, -resources.keysImage.width/2.0, -resources.keysImage.height/2.0);
			context.restore();
		}

		if(speedUpTutorialAlpha > 0.0 && !UIVisible && resources.boostImage)
		{
			context.save();
			context.globalAlpha = speedUpTutorialAlpha;
			context.scale(zoomAdjust, zoomAdjust);
			context.translate(screenWidth*0.5/zoomAdjust, screenHeight*0.825/zoomAdjust);
			context.drawImage(resources.boostImage, -resources.boostImage.width/2.0, -resources.boostImage.height/2.0);
			context.restore();
		}

		if(isInGame)
			minimap.draw(context);

		if(drawHud)
			hud.draw(context);
	};


	app.updateOffscreenInfo = function(element)
	{
		if(localPlayer == null)
			return;

		var bounds = camera.getBounds();
		var bottomLineY = bounds[1].y;

		var screenLeftEdgeX = bounds[1].x;
		var screenRightEdgeX = bounds[0].x;
		var screenTopEdgeY = bounds[0].y;
		var screenBottomEdgeY = bounds[1].y;

		var x;
		var y;

		// King Position - Interpolate
		var t = clamp((now - kingUpdateTime) / INTERP_TIME, 0.0, 1.0);
		kingPosition.x = t * (kingPositionDst.x - kingPositionOrig.x) + kingPositionOrig.x;
		kingPosition.y = t * (kingPositionDst.y - kingPositionOrig.y) + kingPositionOrig.y;

		// King changed? do not interpolate
		if(prevKingID != kingID)
		{
			kingPosition.x = kingPositionDst.x;
			kingPosition.y = kingPositionDst.y;
			kingPositionOrig.x = kingPositionDst.x;
			kingPositionOrig.y = kingPositionDst.y;
			prevKingID = kingID;
		}

		x = kingPosition.x;
		y = kingPosition.y;

		var radius = 50.0;

		if(localPlayer && !isPointVisible(x, y, radius))
		{
			var deltaX = worldScreenCenter.x - x;
			var deltaY = worldScreenCenter.y - y;

			// y = mx + b
			// b = y - mx
			// x = (y-b)/m
			var m = deltaY / deltaX;
			var b = worldScreenCenter.y - m*worldScreenCenter.x;

			if(deltaX < 0)
			{
				offscreenInfo[element].y = m*screenLeftEdgeX+b;
			}else{
				offscreenInfo[element].y = m*screenRightEdgeX+b;
			}

			if(offscreenInfo[element].y < screenTopEdgeY)
			{
				offscreenInfo[element].y = screenTopEdgeY;
			}else if(offscreenInfo[element].y > screenBottomEdgeY)
			{
				offscreenInfo[element].y = screenBottomEdgeY;
			}

			offscreenInfo[element].x = (offscreenInfo[element].y-b)/m;

			// Get Scale according to distance
			var deltaXFar = offscreenInfo[element].x - x;
			var deltaYFar = offscreenInfo[element].y - y;
			var distanceToObject = Math.sqrt(deltaXFar*deltaXFar + deltaYFar*deltaYFar);
			var dScale = 4000;
			var minD = 300;

			offscreenInfo[element].scale = 1.0;
			if(distanceToObject > minD)
			{
				offscreenInfo[element].scale = 1.0 - (distanceToObject-minD)/dScale;

				var min = 0.5;

				if(offscreenInfo[element].scale < min)
					offscreenInfo[element].scale = min;
			}

			if(m > 1.0)
				m = 1.0;
			else if(m < -1.0)
				m = -1.0;
			offscreenInfo[element].angle = Math.acos(m);
			if(deltaX < 0)
				offscreenInfo[element].angle += Math.PI;

			offscreenInfo[element].outside = true;
		}else{
			offscreenInfo[element].outside = false;
		}
	};


	app.drawOffscreenInfo = function(context, element)
	{
		if(!localPlayer || !offscreenInfo[element].outside)
			return;

		var dirForce = 1.0;
		context.save();
		context.translate(offscreenInfo[element].x, offscreenInfo[element].y);

		context.save();
		var offset = 32.0;

		var rotatedVec = rotateVector(0.0, offset, -offscreenInfo[element].angle);
		context.translate(rotatedVec.x, rotatedVec.y);
		context.scale(offscreenInfo[element].scale*0.5, offscreenInfo[element].scale*0.5);

		var hue = 47;
		resources.frames.crown.draw(context);

		context.restore();

		context.rotate(-offscreenInfo[element].angle);

		context.translate(0, -(-10 - 10*dirForce));
		var scale = 0.9;

		scale *= offscreenInfo[element].scale;

		context.fillStyle = 'hsl('+hue+', 100%, 70%)';
		context.beginPath();
		context.moveTo(-4*dirForce*scale,0);
		context.lineTo(4*dirForce*scale,0);
		context.lineTo(0,-10*dirForce*scale);
		context.fill();

		context.restore();
	}

	app.gameCleanup = function()
	{
		localPlayer = undefined;
		isInGame = false;
		playerCount = 0;
		
		// Clear Entities
		for(id in entities) {
			delete entities[id];
		}
		entities = {};
		input.direction = DIRECTION_UP;
		minimap.clearBarriers()
		map.clearBarriers()
	}

	var respawningTimer;
	app.resize = function(e) {
		resizeCanvas();
		if(!network.hasConnection)
			return;
		if(respawningTimer)
			clearTimeout(respawningTimer);
		respawningTimer = setTimeout(network.sendResize, 200);
	};

	app.clearSpeedupTutorial = function() {
		speedupTutorial.clear();
	}

	app.initSpeedupTutorial = function() {
		speedupTutorial.init();
	}

	app.fadeOutGame = function() {
		fadeOut = true;
	}

	app.resetAlpha = function() {
		if(fadeOut)
		{
			fadeOut = false;
			alpha = 1.0;
		}
	}

	var resizeCanvas = function() {
		var res = 2.0;
		if(highQuality)
			res = 1.0;
		canvas.width = window.innerWidth/res;
		canvas.height = window.innerHeight/res;
		screenWidth = canvas.width;
		screenHeight = canvas.height;
		var screenHeightOrig = screenHeight*res;
		var screenWidthOrig = screenWidth*res;

		var perc = -50+(50*res) + '%';
		var p = 'translate('+perc+','+perc+') scale('+res+')';
		$('#canvas').css({ transform: p });
		$('#canvas').css({ '-ms-transform': p });
		$('#canvas').css({ '-webkit-transform': p });

		var minWidth = 850;
		var minHeight = 1500;
		zoomAdjust = Math.max(screenHeight / minWidth, screenWidth / minHeight)*0.92;
		zoomAdjust *= window.devicePixelRatio/defaultRetinaValue;
		verticalZoom = Math.min(1.0, screenHeightOrig / minWidth);

		var dialogHeight = 440*verticalZoom;//$('#mainDialog')[0].clientHeight*verticalZoom; // Lets use a fixed 650 value

		if(dialogHeight > 0)
		{
			var param = 'translate(-50%,0%) scale('+verticalZoom+')';
			$('#mainDialog').css({ transform: param });
			$('#mainDialog').css({ '-ms-transform': param });
			$('#mainDialog').css({ '-webkit-transform': param });

			var vz = screenHeightOrig/2.0 - dialogHeight*0.38;
			$('#mainDialog').css({ 'top': vz+'px' });
		}

/*
		var bgHeight = 1171;
		var bgWidth = 2048;
		var bgScaleH = screenHeight/bgHeight;
		var bgScaleW = screenWidth/bgWidth;
		var bgScale = bgScaleH < bgScaleW ? bgScaleW : bgScaleH;

		var param = 'translate(-50%,-50%) scale('+bgScale+')';
		$('#bgimage').css({ transform: param });
		$('#bgimage').css({ '-ms-transform': param });
		$('#bgimage').css({ '-webkit-transform': param });
*/

		var mult = 1.0;
		if(!highQuality)
			mult = 2.0;
		var offsetY = 30;
		var percPosX = 0.31;
		if(statsFPS){
			// align bottom right
			statsFPS.domElement.style.position = 'absolute';
			statsFPS.domElement.style.left = (canvas.width*percPosX*res)+'px';
			statsFPS.domElement.style.top = (canvas.height*res - 18 - offsetY)+'px';
		}

		if(statsLAG){
			// align bottom right
			statsLAG.domElement.style.position = 'absolute';
			statsLAG.domElement.style.left = ((canvas.width*percPosX-100/res)*res)+'px';
			statsLAG.domElement.style.top = (canvas.height*res - 18 - offsetY)+'px';
		}

		if(statsTPS){
			// align bottom right
			statsTPS.domElement.style.position = 'absolute';
			statsTPS.domElement.style.left = ((canvas.width*percPosX+100/res)*res)+'px';
			statsTPS.domElement.style.top = (canvas.height*res - 18 - offsetY)+'px';
		}
	};

	app.getMouseWorldPosition = function() {
		var resAdjust = 1.0;
		if(!highQuality)
			resAdjust = 2.0;
		return {
			x: (mouse.x + (camera.x * camera.zoom - canvas.width*resAdjust / 2)) / camera.zoom,
			y: (mouse.y + (camera.y * camera.zoom  - canvas.height*resAdjust / 2)) / camera.zoom
		}
	};

	function resourcesLoaded()
	{
		//console.log('Resources loaded!');

		hud = new Hud();

		effects = new Effects();

		if(network.hasConnection && !network.sentHello){
			network.hello();
		}

		speedupTutorial.init();
	}

	// Constructor
	(function(){

		canvas = aCanvas;
		context = canvas.getContext('2d');
		app.context = context;

		resizeCanvas();

		map = new Mapp();
		//map.loadColliders('map.io.client');

		// Animation Manager
		animationManager = new AnimationManager();

		// Resources
		resources = new Resources();
		resources.load(resourcesLoaded);

		myName = "";
		camera = new Camera(canvas, context, 0.0, 0.0);

		// Minimap
		minimap = new Minimap();

		// WebSocket
		network = new Network();
		network.connect();

		// Speed Up Tutorial
		speedupTutorial = new SpeedupTutorial();

		chatt = new Chat();

		// Load sounds
		soundManager = new SoundManager();
		soundManager.load(function(){
			// Load finished
			//console.log('Sounds Loaded');
		});

	})();
}
