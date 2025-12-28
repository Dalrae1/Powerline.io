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

	var directionMap = {
		'w': DIRECTION_UP, 'arrowup': DIRECTION_UP, 'numpad8': DIRECTION_UP,
		'a': DIRECTION_LEFT, 'arrowleft': DIRECTION_LEFT, 'numpad4': DIRECTION_LEFT,
		's': DIRECTION_DOWN, 'arrowdown': DIRECTION_DOWN, 'numpad2': DIRECTION_DOWN,
		'd': DIRECTION_RIGHT, 'arrowright': DIRECTION_RIGHT, 'numpad6': DIRECTION_RIGHT
	};

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
			const requested = directionMap[e.key.toLowerCase()];

			// Turn only if requested direction is valid, not current or opposite
			if (requested &&
				input.direction !== DIRECTION_NONE &&
				requested !== input.direction &&
				Math.abs(input.direction - requested) !== 2) {

				input.turn(requested, globalWebLag);
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

	this.turn = function (direction, fakelag) {
		directionPresses++;

		if (!antiLagEnabled) {
			localPlayer.addTurnPoint(direction, fakelag);
			network.sendDirection(direction);
			return;
		}

		const timeNow = Date.now();
		const deltaTime = timeNow - lastTurnTime;
		lastTurnTime = timeNow;

		if (deltaTime < 30) {
			fakelag += 30;
		}

		input.direction = direction;

		const { x, y } = localPlayer.addTurnPoint(direction, fakelag, window.fixCoord);
		// Only send the needed coordinate
		const coordinate = direction & 1 ? x : -y;
		network.sendTurnPoint(direction, coordinate);
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
