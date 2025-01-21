var Input = function() {
	var input = this;
	var clickPosition = {x: 0, y: 0};

	this.mouseMoved = false;
	this.direction = DIRECTION_UP;
	var lastDirection;
	var directionPresses = 0;
	var mouseMoveEvents = 0;
	var boosting = false
	var invincible = false;

	input.mousedown = function(e) {
		if(UIVisible)
			return;
		mouseMoveEvents++;
		if(mouseMoveEvents > 2)
		{
			arrows = undefined;
			directionPresses = 0;
			mouseMoveEvents = 0;
		}

		mouse.x = e.clientX;
		mouse.y = e.clientY;

		/*
		var mouseWorldPos = app.getMouseWorldPosition();
		var distVolume = GetVolumeAtPoint(mouseWorldPos.x, mouseWorldPos.y);
		var d = distanceBetweenPoints(p.x, p.y, worldScreenCenter.x, worldScreenCenter.y);
		//console.log('DistVolume: ' + distVolume);
		soundManager.playSound(SOUND_CRASH, 1.0*distVolume, 1.0, PLAY_RULE_ALWAYSPLAY, null);
		*/

		//hud.addSpecialMessage('9 KILLSTREAK');
		//hud.addMessage('Killed by', HUD_BOTTOM, 'MALANDRO');
	};

	input.keydown = function(e) {
		//console.log('e.keyCode: ' + e.keyCode);
		if(UIVisible && (e.metaKey || e.ctrlKey) && e.keyCode == 65)
		{
			var label = $('#nick')[0];
			label.setSelectionRange(0, label.value.length);
		}

		var isStatsVisible = $('#statsPanel').is(":visible");
		if(UIVisible && isStatsVisible)
		{
			if(e.keyCode == 13 || e.keyCode == 32) // ENTER or Space
			{
				clickPlay(window.localStorage.nick);
			}else if(e.keyCode == 27) // ESC
			{
				$('#statsPanel').hide();
				$('#basePanel').show();
				$('#nick').focus();
			}
			return;
		}

		if (e.keyCode == 192) {
			commandPallete.toggle();
		}

		if (document.activeElement && document.activeElement.tagName == 'INPUT' && (e.keyCode > 40 || e.keyCode < 37)) {
			return;
		}
			

		if(e.keyCode == 67 && UIVisible && copyingLink)
		{
			setTimeout(function(){
				copied()
			}, 10);
			return;
		}

		if(UIVisible)
			return;

		if (e.keyCode == 32 /* Space */) {
			boosting = false
			// Boost
			boosting = true
			function boostLoop() {
				if (boosting) {
					network.sendBoost(true);
					setTimeout(boostLoop, 100);
				}
				else
					network.sendBoost(false);
			}
			boostLoop()
			//network.sendBoost(true);
			if(arrows != undefined && arrows != 0)
				spacePressedShowTutorialTime = 1000;
		}

		if(e.keyCode == 73) /* i */{
			if(statsVisible)
			{
				statsLAG.domElement.style.visibility = "hidden";
				statsFPS.domElement.style.visibility = "hidden";
				statsTPS.domElement.style.visibility = "hidden";
			}else{
				statsLAG.domElement.style.visibility = "visible";
				statsFPS.domElement.style.visibility = "visible";
				statsTPS.domElement.style.visibility = "visible";
				network.ping();
			}
			statsVisible = !statsVisible;
		}

		if(localPlayer && talkEnabled > 0.0)
		{
			if(e.keyCode >= 49 && e.keyCode <= 57 || e.keyCode == 48)
			{
				if(localPlayer.canTalk())
				{		
					if(e.keyCode >= 49 && e.keyCode <= 57){
						network.sendTalk(e.keyCode - 49 + 1);
						hud.hideTalkLayer();
					}else if(e.keyCode == 48){
						network.sendTalk(10);
						hud.hideTalkLayer();
					}
				}else{
					hud.cantTalk();
				}
			}else if(e.keyCode == 84){
				hud.toggleTalkLayer();
			}
		}

		if(debug && 0)
		{
			if(e.keyCode == 73){ // i
				console.log('AL: ' + antiLagEnabled);
				console.log('WL: ' + globalWebLag);
				console.log('ML: ' + globalMobileLag);
			}else if(e.keyCode == 49){ // 1
				// Toggle display last server position
				drawServerPos = !drawServerPos;
			}else if(e.keyCode == 50){
				antiLagEnabled = !antiLagEnabled;
				console.log('AL: ' + antiLagEnabled);
			}else if(e.keyCode == 187){ // +
				if(localPlayer){
					localPlayer.hue = (localPlayer.hue+10)%360;
					console.log(localPlayer.hue);
				}
			}else if(e.keyCode == 222){ // -
				if(localPlayer){
					localPlayer.hue -= 10;
					if(localPlayer.hue < 0)
						localPlayer.hue = 360;
					console.log(localPlayer.hue);
				}
			}else if(e.keyCode == 51){ // 3
				drawHud = !drawHud;
			}else if(e.keyCode == 52){ // 4
				drawFood = !drawFood;
			}else if(e.keyCode == 53){ // 5
				drawBoundaries = !drawBoundaries;
			}else if(e.keyCode == 54){ // 6
			}else if(e.keyCode == 55){ // 7
				drawStripes = !drawStripes;
			}else if(e.keyCode == 56){ // 8
				drawSpeed = !drawSpeed;
			}else if(e.keyCode == 57){ // 9
				drawAABB = !drawAABB;
			}else if(e.keyCode == 48){ // 0
				glowSnakes = !glowSnakes;
			}else if(e.keyCode == 71){ // G
				network.debugFoodGrab();
			}else if(e.keyCode == 80){ // P
				if(input.direction == DIRECTION_NONE)
				{
					input.direction = lastDirection;
					network.sendDirection();
				}else{
					lastDirection = input.direction;
					input.direction = DIRECTION_NONE;
					network.sendDirection();
				}
			}
		}
		if (e.keyCode == 71) { // G
			network.debugFoodGrab();
		} else if (e.keyCode == 80) { // P
			
			invincible = !invincible;
			network.sendInvincible(invincible);
			
			hud.showTip(invincible && "Invincible" || "Not Invincible");
		}
		
		if(0)
		{
			if(e.keyCode == 75){ // K
				// Suicide
				network.leave();
			}else if(e.keyCode == 76){ // L
				// Suicide and show full arena
				if(!showBigPicture)
					network.bigPicture();
				camera.x = 0;
				camera.y = 0;
				camera.zoom = 0.3599;
				isInGame = false;
				showBigPicture = true;
			}else if(e.keyCode == 88){ // X
				// Toggle debug area
				//map.toggleTestSide();
			}else if(e.keyCode == 67){ // C
				// Iterate through every snake and calculate ideal area

				var objs = Object.keys(entities);
				var count = Object.keys(entities).count;
				var sumTestValue = 0;
				var snakeCount = 0;
				for(var id in entities) {
					var entity = entities[id];
					if(entity.snake)
					{
						sumTestValue += entity.getTestValue();
						snakeCount++;
					}
				}

				console.log('Snakes: ' + snakeCount + ', Sum: ' + sumTestValue);
				console.log('Arena Size: ' + arenaWidth/GAME_SCALE);
				// Update debug area

				//var arenaTestSide = Math.sqrt(sumTestValue);
				//map.updateTestSide(arenaTestSide);
			}
		}

		if(localPlayer)
		{
			var x = localPlayer.x;
			var y = localPlayer.y;
			var fakelag1 = globalWebLag;

			// Should be half because its only one wy trip
			var fakelag2 = 0;

			if(e.keyCode == 38 || e.keyCode == 87){ // Up
				if(input.direction != DIRECTION_UP && input.direction != DIRECTION_DOWN && input.direction != DIRECTION_NONE)
				{
					input.direction = DIRECTION_UP;
					input.turn(input.direction, x, y, fakelag1, fakelag2);
				}
			}else if(e.keyCode == 37 || e.keyCode == 65){ // Left
				if(input.direction != DIRECTION_LEFT && input.direction != DIRECTION_RIGHT && input.direction != DIRECTION_NONE)
				{
					input.direction = DIRECTION_LEFT;
					input.turn(input.direction, x, y, fakelag1, fakelag2);
				}
			}else if(e.keyCode == 40 || e.keyCode == 83){ // Down
				if(input.direction != DIRECTION_DOWN && input.direction != DIRECTION_UP && input.direction != DIRECTION_NONE)
				{
					input.direction = DIRECTION_DOWN;
					input.turn(input.direction, x, y, fakelag1, fakelag2);
				}
			}else if(e.keyCode == 39 || e.keyCode == 68){ // Right
				if(input.direction != DIRECTION_RIGHT && input.direction != DIRECTION_LEFT && input.direction != DIRECTION_NONE)
				{
					input.direction = DIRECTION_RIGHT;
					input.turn(input.direction, x, y, fakelag1, fakelag2);
				}
			}
		}else if(showBigPicture)
		{
			var shift = e.shiftKey;
			var dZoom = 0.01;
			if(shift)
				dZoom = 0.1;
			if(e.keyCode == 38){ // Up
				camera.zoom += dZoom;
			}else if(e.keyCode == 40){ // Down
				camera.zoom -= dZoom;
			}
			console.log(camera.zoom);
			console.log(arenaWidth/GAME_SCALE);
		}

		if(e.keyCode == 70){
        	toggleFullScreen();
        	hud.clearTip();
		}else if(e.keyCode == 77){ // 'm'
			toggleSound();
		}else if(e.keyCode == 90 && debug){ // 'z'
			if(isInGame){
				zoomOut = !zoomOut;
			}
		}
		if(directionPresses > 2)
		{
			arrows = 1;
			window.localStorage.arrows = arrows;

		}
	};

	input.keyup = function(e) {
		if(UIVisible)
			return;

		if(e.keyCode == 32) // Space
		{
			boosting = false
			network.sendBoost(false);
		}else if(e.keyCode == 38){ // Up
		}else if(e.keyCode == 37){ // Left
		}else if(e.keyCode == 40){ // Down
		}else if(e.keyCode == 39){ // Right
		}
	};

	this.turn = function(direction, x, y, fakelag1, fakelag2) {
		directionPresses++;
		if(antiLagEnabled)
		{
			if(0)
			{
				localPlayer.setTurnPoint(direction, x, y);
			}else{
				var timeNow = +new Date();
				var deltaTime = timeNow - lastTurnTime;
				lastTurnTime = timeNow;
				if(deltaTime < 30){
					fakelag1 += 30;
				}

				var selectedPoint = localPlayer.addTurnPoint(direction, fakelag1);
				x = selectedPoint.x*GAME_SCALE;
				y = selectedPoint.y*GAME_SCALE;
			}

			// Should be immediate. setTimeout is for testing.
			//setTimeout(function(){
				var coord; // Only send the needed coordinate
				if(direction == DIRECTION_UP || direction == DIRECTION_DOWN)
					coord = x/GAME_SCALE;
				else
					coord = -y/GAME_SCALE;
				network.sendTurnPoint(direction, coord);
			//}, fakelag2);
		}else{
			network.sendDirection(direction);
		}
	};
	
	this.addListeners = function() {
		// Mouse Events
		document.addEventListener('mousedown', input.mousedown, false);
		//document.addEventListener('mousemove', input.mousemove, false);
		//document.addEventListener('mouseup', input.mouseup, false);

		// Keyboard Events
		document.addEventListener('keydown',    input.keydown, false);
		document.addEventListener('keyup',    input.keyup, false);


	};
}
