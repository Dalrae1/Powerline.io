globalSpecialBody = false;
globalSpecialHead = false;
globalSpecialTail = false

var Snake = function () {
	var snake = this;

	this.snake = true;
	this.killReason = KILL_REASON_LEFT_SCREEN;
	this.id = -1;

	// First Point (head)
	this.x = 0;
	this.y = 0;
	this.prevX = 0;
	this.prevY = 0;
	this.origX = 0;
	this.origY = 0;
	this.dstX = 0;
	this.dstY = 0;

	this.lastServerX = 0;
	this.lastServerY = 0;

	// Point list
	this.points = [];
	this.renderedPoints = [];
	this.pointServerFix = [];
	this.curLength = 0;
	this.curLengthDst = 0;

	this.direction = DIRECTION_UP;

	this.hue = 0;
	this.attached = true;
	this.attracting = false;
	this.invulnerable = false;
	this.shock = false;
	this.decay = false;
	this.still = false;
	this.inside = false;

	this.nick = '';

	this.lastUpdateTime;
	this.highlightTime = 0;
	this.highlightSin = 0;
	var highlight = true;
	var highlightValue = 250;

	// Glow Sprite
	var glowFrame, glowFrameHigh;

	this.redTone = false;
	this.beingDeleted = false;
	this.snakeScale = 1.0;

	this.killedByID = 0;

	var alpha = 1.0;

	this.locatorValue = 0.0;
	var decayEffect = 0;
	playerCount++;

	// AABB
	var lowerBound = {x: 0, y: 0};
	var upperBound = {x: 0, y: 0};

	// Rubbing
	var rubbing = false;
	var rubPoint = {x: 0, y: 0};
	var rubPointOrig = {x: 0, y: 0};
	var rubPointDst = {x: 0, y: 0};
	var rubPointPrev = {x: 0, y: 0};
	var extraSpeed = 0;

	// Boosting
	var boosting = false;

	var headDotCanvas;
	var lastPointCount = 0;
	var headAngle = 0.0;

	var collidePoint = {};
	var afterDieDeltaPos = {};
	var t;
	var prevT;
	var prevDistToCollide = 99.0;
	var dead = false;
	var speed1, speed2;
	var renderedGlowFrame, renderedGlowHardFrame;
	var speedBlink = 0;
	var particleSystem;
	var colorStyle;

	var sparkFrame = 0;
	var sparkFrames = [];
	var lightningFrames = [];
	//var lightningGlow;
	var rubSnakeID = 0;
	var lowFreqGlow = 0;
	var headScale = 1.0;

	// Network anti-lag
	var pendingConfirmationPointCount = 0;
	//this.lastLen = 0;
	this.lastSpeed = 0;

	// Waiting Points
	this.waitingPoints = [];
	var waitingPointCount = 0;

	// Ping
	var ping = 0;
	this.headPos = undefined;
	this.shiftLen = 0;
	var allServerPoints = [];
	this.tutorial = false;
	var testPoint1 = {};
	var testPoint2 = {};
	var mobile = false;
	var killedAnimTime = 0;

	// Sound
	var loopSound;
	var loopFastSound;
	var loopElectroSound;
	var sparkNum = 0;
	var adjustPitch = 0.4;
	var lastDistVolume = 0.0;
	this.playSounds = true;
	var electroActive = false;
	var CONE_DISTANCE = 20;

	// Badges
	var killedKing = false;
	var killstreak = 0;
	var lastKillStreak = 0;

	var boostTime = 0;
	var demogorgon = false;
	var specialBody = globalSpecialBody ? globalSpecialBody : false;
	var specialTail = globalSpecialTail ? globalSpecialTail : false;
	var specialHead = globalSpecialHead ? globalSpecialHead : false;

	// Talk Test
	var talkText = '';
	var talkTime = 0;
	var prevTalkID = 0;
	var talkID = 0;
	var balloonScale = 0;
	this.talkStamina = 0;

	this.processPoint = function(point) {

		this.setTurnPoint(point.d, point.x, point.y);
		waitingPointCount--;
		this.waitingPoints.splice(0, 1);

		var distanceLeft = CalcLength(this.x, this.y, point.x, point.y);
		var directionVectorNorm = GetDirectionVector(point.d);
		this.x = point.x + directionVectorNorm.x*distanceLeft;
		this.y = point.y + directionVectorNorm.y*distanceLeft;

		// More points to process?
		if(waitingPointCount > 0)
		{
			var nextPoint = this.waitingPoints[0];
			var deltaPoints = CalcLength(nextPoint.x, nextPoint.y, point.x, point.y);
			if(distanceLeft > deltaPoints)
			{
				this.processPoint(nextPoint);
			}
		}
	}

	this.update = function (dt) {
		specialBody = globalSpecialBody ? globalSpecialBody : specialBody;
		specialTail = globalSpecialTail ? globalSpecialTail : specialTail;
		specialHead = globalSpecialHead ? globalSpecialHead : specialHead;

		if(!this.beingDeleted)
		{
			prevT = t;
			//t = (now - this.lastUpdateTime) / INTERP_TIME; // Test without clamping
			t = clamp((now - this.lastUpdateTime) / INTERP_TIME, 0.0, 1.0);
			// Interpolate

			if(prevT == t)
				return;

			// First point (tail)
			this.prevX = this.x;
			this.prevY = this.y;

			var newPosX = 0;
			var newPosY = 0;
			var dx;
			var dy;

			// For now, lets assume we are in a straight line
			newPosX = t * (this.dstX - this.origX) + this.origX;
			newPosY = t * (this.dstY - this.origY) + this.origY;

			dx = this.dstX - this.origX;
			dy = this.dstY - this.origY;

			// Calc head angle
			headAngle = Math.atan(dy/dx);
	        if(dx < 0.0)
	        	headAngle = Math.PI + headAngle;
	        headAngle += Math.PI/2.0;

			this.x = newPosX;
			this.y = newPosY;

			var speedX = this.x - this.prevX;
			var speedY = this.y - this.prevY;

			// Test if we have a waiting turn point (no straight line afterall)
			if(waitingPointCount > 0)
			{
				var point = this.waitingPoints[0];
				var waitingPointDistance = CalcLength(this.x, this.y, point.x, point.y);
				var isVertical = (this.direction == DIRECTION_UP || this.direction == DIRECTION_DOWN);
				var turnNow = false;
		        if(isVertical)
		        {
		            if((this.prevY <= point.y && this.y >= point.y) ||
		               (this.y <= point.y && this.prevY >= point.y))
		            {
		                turnNow = true;
		            }
		        }else{
		            if((this.prevX <= point.x && this.x >= point.x) ||
		               (this.x <= point.x && this.prevX >= point.x))
		            {
		                turnNow = true;
		            }
		        }
				if(turnNow)
				{
					this.processPoint(point);
				}
			}

			// Little hack to know last speed
			var speedX = Math.abs(speedX);
			var speedY = Math.abs(speedY);
			speed2 = speed1;
			speed1 = speedX > speedY ? speedX : speedY;

			// Interpolate friction point
			newPosX = t * (rubPointDst.x - rubPointOrig.x) + rubPointOrig.x;
			newPosY = t * (rubPointDst.y - rubPointOrig.y) + rubPointOrig.y;
			rubPoint.x = newPosX;
			rubPoint.y = newPosY;
		}else{
			if(dead)
			{
				this.snakeScale -= 0.1;
				if(this.snakeScale < 0)
				{
					if(this.id == localPlayerID){
						input.direction = DIRECTION_UP;
						localPlayerID = 0;
						localPlayer = null;
						statKillReason = this.killReason;
						if(this.killedByID == this.id)
							statKillReason = KILL_REASON_SUICIDE;
					}
					delete entities[this.id];
					this.cleanup();
				}
			}else{
				var newDist = CalcLength(this.x + afterDieDeltaPos.x, this.y + afterDieDeltaPos.y, collidePoint.x, collidePoint.y);
				//console.log('newDist ' + newDist);
				if(newDist > prevDistToCollide)
				{
					dead = true;
					this.points.unshift({x: this.x, y: this.y});
					this.x = collidePoint.x;
					this.y = collidePoint.y;
				}else{
					this.x += afterDieDeltaPos.x;
					this.y += afterDieDeltaPos.y;
				}
				prevDistToCollide = newDist;

				// Will this fix an issue where snakes stay forever?
				killedAnimTime += dt;
				if(killedAnimTime > 3000 && !dead)
				{
					if(debug)
					{
						console.log('bf');
					}
					dead = true;
				}
			}
		}

		this.curLength += (this.curLengthDst - this.curLength)/10.0;

		// Testing Particle System
		if(particleSystem){
			// Flames point
			var angle = 1;
			if(this.headPos)
			{
				var flamesStartX = this.headPos.x
				var flamesStartY = this.headPos.y;
				particleSystem.setPosition(flamesStartX, flamesStartY);
			}
		}
		if(particleSystem)
			particleSystem.update(dt);

		// ================================
		// Enable particles if speed over 30%
		if(extraSpeed > 30 || boosting)
		{
			if(!particleSystem.enabled)
				particleSystem.setEnabled(true);
		}else if(extraSpeed <= 30)
		{
			if(particleSystem.enabled)
				particleSystem.setEnabled(false);
		}

		if(this.playSounds)
			lastDistVolume = GetVolumeAtPoint(this.x, this.y);

		if(!firstClick){ // No sound before first play
			lastDistVolume = 0;
		}else if(UIVisible){
			lastDistVolume = lastDistVolume * 0.3;
		}
		if(loopSound && this.playSounds){
			adjustPitch -= 0.01;
			if(adjustPitch < 0)
				adjustPitch = 0;
			var node = soundManager.sound._nodeById(loopSound);
			var pitch = 0.8 + (extraSpeed/100.0)*1.5 - adjustPitch;
			node.bufferSource.playbackRate.value = pitch;

			var vol = VOLUME_LINE_LOOP_MIN + (extraSpeed/100.0)*(VOLUME_LINE_LOOP_MAX-VOLUME_LINE_LOOP_MIN);

			soundManager.sound.volume(vol*lastDistVolume*masterVolume, loopSound);
		}
		if(loopFastSound && this.playSounds){
			//var node = soundManager.sound._nodeById(loopFastSound);
			//var pitch = 0.8 + (extraSpeed/100.0)*1.5;
			var minVol = 30;
			var loopFastVolume = Math.max(0, (extraSpeed - minVol)/(100 - minVol));
			soundManager.sound.volume(loopFastVolume*VOLUME_LINE_FAST_LOOP*lastDistVolume*masterVolume, loopFastSound);
		}
		if(loopElectroSound && this.playSounds){
			var node = soundManager.sound._nodeById(loopElectroSound);

			if(electroActive)
			{
				//var pitch = 0.8 + (extraSpeed/100.0)*1.5;
				//node.bufferSource.playbackRate.value = pitch;

				soundManager.sound.volume(VOLUME_ELECTRO_LOOP*lastDistVolume*masterVolume, loopElectroSound);
			}else{
				soundManager.sound.volume(0, loopElectroSound);				
			}
		}

		// Finish speedup tutorial
		if(rubbing && !inGameSpeedTutorial && isInGame && localPlayer == this)
		{
			boostTime += dt;
			if(boostTime > 2000)
			{
				inGameSpeedTutorial = 1;
				window.localStorage.speedUpTut = 1;
			}
		}

		var incSpeed = (dt/1000.0)*20.0;
		if(talkID > 0)
		{

			balloonScale += incSpeed;
			var limit = (3.0/4.0)*(Math.PI);
			if(balloonScale > limit)
				balloonScale = limit;
		}else{
			balloonScale -= incSpeed;
			if(balloonScale < 0.0)
				balloonScale = 0.0;
		}
	};

	this.drawCircle = function(context, x, y, color, size) {
		context.beginPath();
		context.arc(x, y, size, 0, 2 * Math.PI, false);
		context.fillStyle = color;
		context.fill();
	}

	this.drawSpark = function(x, y, angle, scale, frame, context) {
		if(!sparkFrames[frame])
			return; // Fix issue
		context.save();
		context.globalAlpha = alpha;
		context.translate(x, y);
		context.rotate(angle);
		context.scale(scale, scale);
		context.translate(0, -(sparkFrames[frame].height/2.0));
		sparkFrames[frame].draw(context);
		context.restore();
	}

	this.drawTail = function(points, context) {
		var pointLen = points.length;
		var segmentDistance = 40.0;
		var distanceAcc = 0;
		var prevX = points[0].x;
		var prevY = points[0].y;

		context.beginPath();
		context.moveTo(prevX, prevY);
		for(var i = 1; i < pointLen; i++)
		{
			var curX = points[i].x;
			var curY = points[i].y;
			context.lineTo(curX, curY);
			prevX = curX;
			prevY = curY;
		}

		context.stroke();
	}

	this.getWidth = function() {
		var w = (this.curLength - startLength);
		w /= 1000.0;
		w += 2.5;
		if(w > 8.0)
			w = 8.0;

		var size = 5.0;
		return w*(size - this.snakeScale*(size-1));
	}

	this.getPointList = function(shiftLenList) {
		var startPoint = 0;
		var count = this.points.length;
		var lastPx = this.x;
		var lastPy = this.y;
		var length = 0;

		var lenListSize = shiftLenList.length;
		var shiftLen = shiftLenList[0];
		var pointList = [];
		for(var i = startPoint; i < count; i++)
		{
				p = this.points[i];

				var l = CalcLength(lastPx, lastPy, p.x, p.y);
				length += l;

				if(length > shiftLen)
				{
					// Push First Point
					var extraLength = length - shiftLen;
					var dx = lastPx - p.x;
					var dy = lastPy - p.y;
					var vLen = VectorLength(dx, dy);
					var remainingLength = vLen - extraLength;
					var n = Normalize(dx,dy);
					n.x *= remainingLength;
					n.y *= remainingLength;
					//lastPx = lastPx-n.x;
					//lastPy = lastPy-n.y;
					pointList.push({x: lastPx-n.x, y: lastPy-n.y});

					// Loop and start from this point						
					//length = 0; // Reset length
					length -= l;
					i--;
					lenListSize--;
					shiftLenList.splice(0, 1);
					shiftLen = shiftLenList[0];
					if(lenListSize == 0)
						break;
					else
						continue;
				}

				lastPx = p.x;
				lastPy = p.y;
		}
		return pointList;
	}

	this.calcRenderPoints = function() {
		var pointArray = [];
		var count = this.points.length;

		var length = 0.0;
		var lastPx = this.x;
		var lastPy = this.y;

		var startPoint = 0;

		var shiftLen = 0.0;
		var headPos = {x: this.x, y: this.y};
		if(localPlayerID != this.id && !this.tutorial){
			var fakelag;
			if(mobile)
				fakelag = globalMobileLag;
			else
				fakelag = globalWebLag;

			var shiftLag = Math.max((myPing/2.0+ping/2.0)-globalWebLag+lagAddRender, 0);
			var distance = (shiftLag * this.lastSpeed)/INTERP_TIME;
			shiftLen = distance;
			//console.log('My Ping: ' + myPing + ', Ping: ' + ping + ', Shift: ' + shiftLag + ', shiftLen: ' + shiftLen);
		}
		var shouldAddPoints = false;
		var p;
		for(var i = startPoint; i < count; i++)
		{
				p = this.points[i];

				var l = CalcLength(lastPx, lastPy, p.x, p.y);
				length += l;

				if(shouldAddPoints)
				{
					if(length > this.curLength)
					{
						var extraLength = length - this.curLength;
						var dx = lastPx - p.x;
						var dy = lastPy - p.y;
						var vLen = VectorLength(dx, dy);
						var remainingLength = vLen - extraLength;
						var n = Normalize(dx,dy);
						n.x *= remainingLength;
						n.y *= remainingLength;
						pointArray.push({x: lastPx-n.x, y: lastPy-n.y});
						break;
					}else{
						pointArray.push({x: p.x, y: p.y});
					}
				}else{
					if(length > shiftLen)
					{
						// Push First Point
						var extraLength = length - shiftLen;
						var dx = lastPx - p.x;
						var dy = lastPy - p.y;
						var vLen = VectorLength(dx, dy);
						var remainingLength = vLen - extraLength;
						var n = Normalize(dx,dy);
						n.x *= remainingLength;
						n.y *= remainingLength;
						lastPx = lastPx-n.x;
						lastPy = lastPy-n.y;
						pointArray.push({x: lastPx, y: lastPy});
						headPos.x = lastPx;
						headPos.y = lastPy;
						
						// Loop and start from this point						
						length = 0; // Reset length
						shouldAddPoints = true;
						i--;
						continue;
					}
				}

				lastPx = p.x;
				lastPy = p.y;
		}

		// Prevent crash on startup
		if(pointArray.length == 0)
			pointArray.push({x: 0, y: 0});

		this.headPos = headPos;
		this.renderedPoints = pointArray;
		this.shiftLen = shiftLen;
	}

	this.drawAfter = function(context) {
		var v = 50;// = parseInt(((1.0 - this.snakeScale)*50.0).toFixed(0))+50;
		if(this.beingDeleted)
			v = 100;

		if(demogorgon){
			v = 100;
		}
		var color = 'hsl('+this.hue+', 100%, '+v+'%)';
				
		var w = this.getWidth();
		headScale = w/2.5;
		if(headScale > 1.0)
		{
			// Grow head, but slower
			headScale = 1.0 + (headScale - 1.0)*0.6;
		}

		// Debug - draw snake position at server
		if(drawServerPos)
		{
			this.drawCircle(context, this.lastServerX, this.lastServerY, '#FFFF00', 4);
			this.drawCircle(context, testPoint1.x, testPoint1.y, '#00FFFF', 4);
			this.drawCircle(context, testPoint2.x, testPoint2.y, '#00FFFF', 4);
		}

		this.calcRenderPoints();

		// ============
		// Rubbing point - Draw spark and lightning frames
		electroActive = false;
		var frameReset = (100 - extraSpeed)/30;
		if(rubbing && this.headPos)
		{
			if(rubSnakeID > 0)
			{
				var snake = entities[rubSnakeID];
				if(snake){
        			var otherSnakeW = snake.getWidth()/2.0+0.1;

					// Get offset
					var dx = this.headPos.x-rubPoint.x;
					var dy = this.headPos.y-rubPoint.y;
					var lightAngle = Math.atan2(dy, dx);

					var sparkAngle = lightAngle + Math.PI/2.0;
					
					// Offset from the center
					var ox = Math.sin(-sparkAngle);
        			var oy = Math.cos(-sparkAngle);
        			ox *= otherSnakeW;
        			oy *= otherSnakeW;

        			var rubPointShift = {x: rubPoint.x - ox, y: rubPoint.y - oy};
					dx = this.headPos.x-rubPointShift.x;
					dy = this.headPos.y-rubPointShift.y;

					var midX = (this.headPos.x + rubPointShift.x)/2.0;
					var midY = (this.headPos.y + rubPointShift.y)/2.0;

					var frame = parseInt(RandomWithRange(0, 2));
					var distance = Math.sqrt(dx*dx+dy*dy);

					// ============
					// Draw lightning
					var doubleSparkDistance = 5.0;
					if(sparkFrame == 0 && distance >= doubleSparkDistance)
					{
						context.save();
						context.globalAlpha = alpha;
						context.translate(midX, midY);
						
						context.rotate(lightAngle + Math.PI/2.0);

						var height = resources.frames.lightning1.height;
						var lightningScale = distance/height;
						var rndVal = Math.random();
						var sign1 = 1;
						var sign2 = 1;

						if(rndVal < 1/4){
							sign1 = -1;
						}
						else if(rndVal < 2/4){
							sign2 = -1;
						}else if(rndVal < 3/4){
							sign1 = -1;
							sign2 = -1;
						}

						context.scale(lightningScale*sign1, lightningScale*sign2);

						lightningFrames[frame].draw(context);

						context.restore();
					}

					// ============
					// Draw Spark
					var drawCone = false;

					if(frameReset < 2 || distance <= CONE_DISTANCE){
						drawCone = true;
						electroActive = true;
					}

					var v1 = distance/40.0;
					var scale = 1.0 - distance/40.0;
					scale = Clamp(scale, 0.2, 0.5) + 0.0;
					var scaleupSpeed = 40; // Start scaling up above 40% speed until 100%
					var scaleUpSpeed1m = 100 - scaleupSpeed;
					if(extraSpeed > scaleupSpeed)
					{
						scale += ((extraSpeed-scaleupSpeed)/scaleUpSpeed1m)*0.3; // Change this var for different max size
					}

					if(drawCone)
						snake.drawSpark(rubPoint.x-ox, rubPoint.y-oy, sparkAngle, scale, frame, context);

					if(distance < doubleSparkDistance){
						snake.drawSpark(rubPoint.x+ox, rubPoint.y+oy, sparkAngle, -scale, frame, context);
					}
				}
			}

			sparkFrame++;
			
			if(frameReset < 2)
				frameReset = 2;
			if(sparkFrame > frameReset){
				sparkFrame = 0;
				var freq = 1.0;
				if(this.playSounds)
					soundManager.playSound(SOUND_SPARK, VOLUME_SPARK*lastDistVolume*masterVolume, freq, PLAY_RULE_ALWAYSPLAY, null);
			}
		}

		// ===========================
		// Draw snake body
		if(glowSnakes && highQuality)
		{
			context.shadowColor = color;
      		context.shadowBlur = 5;
		}
		context.save();
		context.globalAlpha = 1.0*alpha;
		context.beginPath();

		context.lineWidth = (w)*this.snakeScale;
		context.lineCap = 'round';
		context.lineJoin="round";
		context.strokeStyle = color;
		var v = 60;
		if(this.beingDeleted)
			v = 100;

		if(demogorgon){
			v = 100;
			context.lineWidth = (w+1)*this.snakeScale;
		}
		context.strokeStyle = 'hsl('+this.hue+', 100%, '+v+'%)';
		

		

		if(glowSnakes && highQuality)
		{
			context.shadowBlur = 15;
		}

		if (specialBody)
			eval(specialBody)

		this.drawTail(this.renderedPoints, context);

		

		if(demogorgon){
			context.lineWidth = (w)*this.snakeScale;
			context.strokeStyle = 'hsl(0, 100%, 0%)';
			this.drawTail(this.renderedPoints, context);
		}

		if (specialTail)
			eval(specialTail)


		var lenMin = 4000;
		var lenMax = 4500;
		if(this.curLength > lenMin && highQuality)
		{
			var dashAlpha = 1.0;
			if(this.curLength < lenMax)
			{
				dashAlpha = 1.0 - (lenMax - this.curLength)/(lenMax-lenMin);
			}
			context.globalAlpha = dashAlpha*alpha;

			context.shadowBlur = 5;
			context.lineWidth = (w-2.0)*this.snakeScale;
			var dotHue = this.hue;
			var colorAlt = 'hsl('+dotHue+', 100%, '+90+'%)';
			context.strokeStyle = colorAlt;
			context.shadowColor = colorAlt;
			var mult = (w/4.0)*1.5;
			var dash1 = 10*mult;
			var dash2 = 12*mult;
			context.setLineDash([dash1, dash2]);
			tt = 15.0*headScale;
			context.lineDashOffset = tt;
			this.drawTail(this.renderedPoints, context);
			context.globalAlpha = 1.0;
		}
		

		// Highlight line color
		if(extraSpeed > 10)
		{
			var lightPerc = ((extraSpeed-10)/50);
			if(extraSpeed > 50)
				lightPerc = 1.0;
			context.globalAlpha = lightPerc*alpha;
			context.shadowBlur = 0;
			context.strokeStyle = 'hsl('+this.hue+', 100%, 90%)';
			context.lineWidth = (w-0.8)*this.snakeScale;
			this.drawTail(this.renderedPoints, context);
			context.globalAlpha = 1.0*alpha;
		}
		context.shadowBlur = 0; // Only blur line

		
		// DEBUG: Draw Server Snake Info
		if (localPlayer && localPlayer.nick == "DebugSnake") {
			var serverPointsCount = allServerPoints.length;
			console.log(this.id, serverPointsCount);
			context.beginPath();
			for (var i = 0; i < serverPointsCount; i++) {
				var point = allServerPoints[i];
				if (i == 0)
					context.moveTo(point.x, point.y);
				else
					context.lineTo(point.x, point.y);
			}
			context.strokeStyle = '#FFFFFF';
			context.lineWidth = 5;
			context.stroke();
		}


		// =================
		// Draw Head and effects
		context.translate(this.headPos.x, this.headPos.y);

		// Special Glow with ultra-high speed
		var fadeInSpeed = 30;
		if(extraSpeed > fadeInSpeed)
		{
			var fadeInSpeed1m = 100 - fadeInSpeed;
			var glowAlpha = ((extraSpeed-fadeInSpeed)/fadeInSpeed1m);
			if(lowFreqGlow == 0)
				glowAlpha *= 0.5;
			context.globalAlpha = glowAlpha*0.4*alpha;

			var s = 0.9;
			context.scale(s, s);
			renderedGlowHardFrame.draw(context);
			context.scale(1.0/s, 1.0/s);

			context.globalAlpha = 1.0*alpha;
		}

		// Simple glow with slow speed
		if(extraSpeed > 5)
		{
			var speedPerc = ((extraSpeed-5)/50);
			if(extraSpeed > 50)
				speedPerc = 1.0;
			var glowScale = 0.6*speedPerc;

			// Blink tests - didn't like it
			//speedBlink += speedPerc*0.2;
			//context.globalAlpha = (Math.sin(speedBlink) + 1.0)/2.0;

			context.scale(glowScale, glowScale);
			renderedGlowFrame.draw(context);
			context.globalAlpha = 1.0*alpha;
			context.scale(1.0/glowScale, 1.0/glowScale);

			lowFreqGlow++;
			if(lowFreqGlow>2)
				lowFreqGlow=0;
		}

		// =========
		// Draw Head
		if (specialHead)
			eval(specialHead)

		var tmpScale = this.snakeScale*headScale;

		context.scale(0.21*tmpScale, 0.21*tmpScale);
		
		headDotCanvas.draw(context);
		context.restore();

		context.shadowBlur = 0;
		context.globalAlpha = 0.7*alpha;
		var pointList = this.getPointList([(2.5*tmpScale+this.shiftLen), (5*tmpScale+this.shiftLen), (7.5*tmpScale+this.shiftLen), (8.5*tmpScale+this.shiftLen)]);
		if(pointList.length == 4)
		{
			context.save();
			var nextPoint = pointList[0];
			context.translate(nextPoint.x, nextPoint.y);
			context.scale(0.19*tmpScale, 0.19*tmpScale);
			headDotCanvas.draw(context);
			context.restore();

			context.globalAlpha = 0.5*alpha;
			context.save();
			nextPoint = pointList[1];
			context.translate(nextPoint.x, nextPoint.y);
			context.scale(0.16*tmpScale, 0.16*tmpScale);
			headDotCanvas.draw(context);
			context.restore();

			context.globalAlpha = 0.3*alpha;
			context.save();
			nextPoint = pointList[2];
			context.translate(nextPoint.x, nextPoint.y);
			context.scale(0.12*tmpScale, 0.12*tmpScale);
			headDotCanvas.draw(context);
			context.restore();

			context.globalAlpha = 0.1*alpha;
			context.save();
			nextPoint = pointList[3];
			context.translate(nextPoint.x, nextPoint.y);
			context.scale(0.12*tmpScale, 0.12*tmpScale);
			headDotCanvas.draw(context);
			context.restore();
		}
		context.globalAlpha = 1.0*alpha;

		if(drawAABB) // Draw AABB ?
		{
			context.save();
			context.lineWidth = 2.0;
			context.strokeStyle = '#FFFFFF';
			context.beginPath();
			context.rect(lowerBound.x,upperBound.y,upperBound.x - lowerBound.x, lowerBound.y - upperBound.y);
			context.stroke();
			context.restore();
		}

		// Particle System Test
		if(particleSystem){
			particleSystem.alpha = 1.0*alpha;
			particleSystem.draw(context);
		}

		context.globalAlpha = 1.0;
	};

	this.draw = function(context) {
	};

	this.drawInput = function(context) {
	};

	this.drawKillStreakIcon = function(context, streak) {
		var skull = 0;
		if(streak >= 8 && streak < 13)
			skull = 0;
		else if(streak >= 13 && streak < 18)
			skull = 1;
		else if(streak >= 18 && streak < 23)
			skull = 2;
		else if(streak >= 23)
			skull = 3;

		var s = 1.0;
		var plusS = ((streak - 8)/22)*0.8;
		if(plusS > 0.8)
			plusS = 0.8;
		s += plusS;
		context.scale(s, s);
		context.translate(0, -4*s);

		resources.frames.skullback.draw(context);
		if(skull == 0)
		{
			resources.frames.skullbase.draw(context);
			resources.frames.skullglow.draw(context);
			if(streak > 8)
				resources.frames.skulleyesred.draw(context);
		}else if(skull == 1)
		{
			resources.skullDarkBlue.draw(context);
			resources.skullDarkBlueGlow.draw(context);
			resources.frames.skulleyesyellow.draw(context);
		}else if(skull == 2)
		{
			resources.skullPurple.draw(context);
			resources.skullPurpleGlow.draw(context);
			resources.frames.skulleyesgreen.draw(context);
		}else if(skull == 3)
		{
			resources.skullRed.draw(context);
			resources.skullRedGlow.draw(context);
			resources.frames.skulleyesblue.draw(context);
		}
		resources.frames.skullgradient.draw(context);

		var fillStyle = 'rgba(0, 200, 255, 1.0)';
		context.fillStyle = fillStyle;
		context.font = 'Bold ' + 18 + "px 'proxima-nova-1','proxima-nova-2', Arial";
		context.shadowBlur = 5;
		context.shadowColor = fillStyle;
		var width = context.measureText(streak).width;
		context.fillText(streak, -width/2.0, -30);
		context.shadowBlur = 0;

		context.scale(1.0/s, 1.0/s);
	};

	this.drawInfo = function(context) {
		// Name
		if(this.headPos == undefined || this.beingDeleted)
			return;
		context.save();
		context.globalAlpha = alpha;
		context.translate(this.headPos.x, this.headPos.y);

		// King Crown
		var isKing = this.id == kingID;
		var yOffset = 20.0;
		var extraScale = ((headScale - 1.0) * 0.5) + 1.0;
		var s = 0.55*extraScale;
		if(isKing)
		{
			context.translate(0, -yOffset*extraScale);
			context.scale(s, s);
			resources.frames.crown.draw(context);
			context.scale(1.0/s, 1.0/s);
			context.translate(0, yOffset*extraScale);
			yOffset += 20.0;
		}

		if(killedKing)
		{
			s = 0.45*extraScale;
			context.translate(0, -yOffset*extraScale);
			context.scale(s, s);
			resources.frames.trophy.draw(context);
			context.scale(1.0/s, 1.0/s);
			context.translate(0, yOffset*extraScale);
			yOffset += 20.0;
		}

		if(killstreak > 0)
		{
			s = 0.35*extraScale;
			context.translate(0, -yOffset*extraScale);
			context.scale(s, s);
			this.drawKillStreakIcon(context, killstreak);
			context.scale(1.0/s, 1.0/s);
			context.translate(0, yOffset*extraScale);
		}

		context.globalAlpha = 0.85*alpha;
		drawName(context);
		context.restore();

		// Test Talk Balloon
		if(balloonScale > 0)
		{
			context.save();
			context.globalAlpha = 1.0;
			context.translate(this.headPos.x, this.headPos.y);

			var scale = Math.sin(balloonScale);
			var lim = Math.sin(Math.PI*(3.0/4.0));
			if(scale > lim)
				scale = lim + (1.0 - lim)*0.5;
			context.scale(scale, scale);

			var offsetY = -20;
			var fontSize = 8;
			context.fillStyle = 'rgba(0, 60, 60, 1.0)';
			context.font = 'Bold ' + fontSize + "px 'proxima-nova-1','proxima-nova-2', Arial";
			context.textBaseline = 'hanging';

			var width = context.measureText(talkText).width;

			var xOffset = width/2.0 + 13.0;
			var rectW = width + 8;
			var rectH = fontSize + 5;

			var centerRange = 7;
			context.beginPath();
			context.moveTo(-4, -4);
			context.lineTo(-20-centerRange, -20);
			context.lineTo(-20+centerRange, -20);
			context.closePath();
			context.fill();


			drawRoundedRectangle(context, -rectW/2.0 - xOffset, -rectH/2.0 + offsetY + 2, rectW, rectH, 6);

			context.fillStyle = 'rgba(0, 255, 255, 1.0)';
			context.fillText(talkText, -width/2 - xOffset, offsetY);
			context.restore();

		}

	};

	var drawName = function(context) {
		context.fillStyle = 'rgba(255, 255, 255, 0.6)';
		context.font = 'Bold ' + 10 + "px 'proxima-nova-1','proxima-nova-2', Arial";
		context.textBaseline = 'hanging';
		var name = snake.nick.substring(0, 16);
		if(drawSpeed)
			name += ' ('+extraSpeed.toFixed(0)+') (' + ping + ')';
		var width = context.measureText(name).width;
		var offsetY = 30;
		context.fillText(name, -width/2, offsetY);
	};

	this.updateNetwork = function(view, offset, isFull) {
		var curX;
		var curY;

		curX = view.getFloat32(offset, true)*GAME_SCALE;
		offset += 4;

		curY = -view.getFloat32(offset, true)*GAME_SCALE;
		offset += 4;

		this.lastServerX = curX;
		this.lastServerY = curY;

		//this.lastLen = view.getFloat32(offset, true)*GAME_SCALE;
		//offset += 4;
		
		this.lastSpeed = view.getFloat32(offset, true)*GAME_SCALE*UPDATE_EVERY_N_TICKS;
		offset += 4;

		//var var1 = this.lastSpeed * UPDATE_EVERY_N_TICKS;
		//var var2 = this.lastLen;

		//console.log('speed: ' + var1 + '; this.lastLen: ' + var2);

		this.curLengthDst = view.getFloat32(offset, true)*GAME_SCALE;
		offset += 4;

		//this.direction = view.getUint8(offset, true);
		offset += 1;

		curPointCount = view.getUint16(offset, true);
		offset += 2;
		//console.log('curPointCount ' + curPointCount);

		// Update head
		if(waitingPointCount == 0 && pendingConfirmationPointCount <= 0)
		{
			this.origX = this.x;
			this.origY = this.y;
			this.dstX = curX;
			this.dstY = curY;
		}else{
			this.origX = this.x;
			this.origY = this.y;
			var direction = GetDirectionVector(this.direction);
			this.dstX += direction.x*this.lastSpeed;
			this.dstY += direction.y*this.lastSpeed;
		}

		// Flags
		var flags = view.getUint8(offset, true);
		offset += 1;
		if (flags & 0x80) { // Includes custom flags, represented by 16 bits
			flags = view.getUint16(offset, true);
			offset += 2;
		}
		if(flags & 0x1) // Debug?
		{
			console.log("Debug")
			lowerBound.x = view.getFloat32(offset, true);
			offset += 4;
			lowerBound.y = -view.getFloat32(offset, true);
			offset += 4;
			upperBound.x = view.getFloat32(offset, true);
			offset += 4;
			upperBound.y = -view.getFloat32(offset, true);
			offset += 4;

			lowerBound.x *= GAME_SCALE;
			lowerBound.y *= GAME_SCALE;
			upperBound.x *= GAME_SCALE;
			upperBound.y *= GAME_SCALE;

			// Test points
			testPoint1.x = view.getFloat32(offset, true)*GAME_SCALE;
			offset += 4;
			testPoint1.y = -view.getFloat32(offset, true)*GAME_SCALE;
			offset += 4;
			testPoint2.x = view.getFloat32(offset, true)*GAME_SCALE;
			offset += 4;
			testPoint2.y = -view.getFloat32(offset, true)*GAME_SCALE;
			offset += 4;

			// Snake - All points
			var totalPointCount = view.getUint16(offset, true);
			offset += 2;
			allServerPoints = [];
			for(var i = 0; i < totalPointCount; i++)
			{
				var px = view.getFloat32(offset, true);
				offset += 4;
				var py = -view.getFloat32(offset, true);
				offset += 4;
				allServerPoints.push({x: px*GAME_SCALE, y: py*GAME_SCALE});
			}
		}

		if(flags & 0x2) // Rubbing?
		{
			var rubX = view.getFloat32(offset, true);
			offset += 4;
			var rubY = -view.getFloat32(offset, true);
			offset += 4;

			rubSnakeID = view.getUint16(offset, true);
			offset += 2;

			rubPointOrig.x = rubPoint.x;
			rubPointOrig.y = rubPoint.y;
			rubPointDst.x = rubX*GAME_SCALE;
			rubPointDst.y = rubY*GAME_SCALE;

			if(!rubbing)
			{
				rubPoint.x = rubPointDst.x;
				rubPoint.y = rubPointDst.y;
				rubPointOrig.x = rubPointDst.x;
				rubPointOrig.y = rubPointDst.y;

				rubbing = true;
			}
		}else{
			rubbing = false;
		}

		if(flags & 0x4) // Boosting?
		{
			boosting = true;
		}else{
			boosting = false;
		}

		if(flags & 0x8) // Ping?
		{
			ping = view.getUint16(offset, true);
			offset += 2;
			//console.log('Ping: ' + ping);
		}

		killedKing = flags & 0x10; // Killed King?

		if(flags & 0x20) // Killstreak
		{
			killstreak = view.getUint16(offset, true);
			offset += 2;

			if(lastKillStreak != killstreak && localPlayer == this && isInGame)
			{
				lastKillStreak = killstreak;
				hud.addSpecialMessage(killstreak + ' PLAYER KILL STREAK', 25);
			}
		}else{
			killstreak = 0;
		}

		if(flags & 0x40) // Talk?
		{
			talkID = view.getUint8(offset, true);
			offset += 1;

			talkText = this.getTalkTextByTalkID(talkID);
		}else{
			if (flags & 0x80) // Custom talk
			{
				var talkMessage = getString(view, offset);
				talkID = 20
				offset = talkMessage.offset;
				talkText = talkMessage.nick;
			}else{
				talkID = 0;
			}
		}
		
		if (flags & 0x100) // Custom color
		{
			var customHeadColor = getString(view, offset);
			var customBodyColor = getString(view, customHeadColor.offset);
			var customTailColor = getString(view, customBodyColor.offset);
			offset = customTailColor.offset;
			
			specialHead = customHeadColor.nick;
			specialBody = customBodyColor.nick;
			specialTail = customTailColor.nick;
			
		}

		this.talkStamina = view.getUint8(offset, true);
		offset += 1;

		// Extra Speed Perc
		extraSpeed = (view.getUint8(offset, true)/255)*100.0;
		offset += 1;

		if(localPlayer == this)
		{
			var myScore = this.curLengthDst - startLength;
			var zt = Clamp(myScore/minZoomScore, 0, 1);
			targetZoom = defaultZoom - (defaultZoom - minZoom)*zt;
		}

		// Do not interpolate, it just appeared on screen
		if(isFull)
		{
			if(this.nick == 'demogorgon')
				demogorgon = true;

			this.origX = this.dstX;
			this.origY = this.dstY;
			this.x = this.dstX;
			this.y = this.dstY;
			this.curLength = this.curLengthDst;

			// Snake Points
			this.points = [];
			for(var i = 0; i < curPointCount; i++)
			{
				var pointX = view.getFloat32(offset, true);
				offset += 4;

				var pointY = -view.getFloat32(offset, true);
				offset += 4;

				this.points.push({x: pointX*GAME_SCALE, y: pointY*GAME_SCALE});
			}

			this.hue = view.getUint16(offset, true);
			offset += 2;

			mobile = (view.getUint8(offset) == 1);
			offset +=1;

			colorStyle = 'hsl('+this.hue+', 100%, 50%)';
			var eyesStyle = 'hsl('+this.hue+', 100%, 20%)';
			var brightStyle = 'hsl('+this.hue+', 100%, 90%)';
			var lightStyle = 'hsl('+this.hue+', 100%, 70%)';
			headDotCanvas = resources.frames.head_dot.renderTintedFrame('#FFFFFF');
			renderedGlowFrame = resources.frames.glow.renderTintedFrame(colorStyle);
			renderedGlowHardFrame = resources.frames.glow_hard.renderTintedFrame(brightStyle);
			
			lightningFrames.push(resources.frames.lightning1.renderTintedFrame(colorStyle));
			lightningFrames.push(resources.frames.lightning2.renderTintedFrame(colorStyle));
			lightningFrames.push(resources.frames.lightning3.renderTintedFrame(colorStyle));
			//lightningGlow = resources.frames.lightning_glow.renderTintedFrame(colorStyle);

			sparkFrames.push(resources.frames.spark0.renderTintedFrame(lightStyle));
			sparkFrames.push(resources.frames.spark1.renderTintedFrame(lightStyle));
			sparkFrames.push(resources.frames.spark2.renderTintedFrame(lightStyle));

			var particleFrame = resources.frames.particleDot.renderTintedFrame('hsl('+this.hue+', 100%, 80%)');
			// Testing particle system - Needs to be adjusted
			particleSystem = new ParticleSystem();
			particleSystem.particleFrame = particleFrame;
			particleSystem.init(10, this.x, this.y);

			if(this.playSounds)
			{
				// Init looping sound
				soundManager.playSound(SOUND_LINE_LOOP, 0.0, 1.0, PLAY_RULE_ALWAYSPLAY, function(instance){
					loopSound = instance;
				});
				soundManager.playSound(SOUND_LINE_FAST_LOOP, 0.0, 1.0, PLAY_RULE_ALWAYSPLAY, function(instance){
					loopFastSound = instance;
				});
				soundManager.playSound(SOUND_ELECTRO_LOOP, 0.0, 1.0, PLAY_RULE_ALWAYSPLAY, function(instance){
					loopElectroSound = instance;
				});
			}

		}else{
			// New points?
			var newPointCount = view.getUint8(offset, true);
			offset++;

			if(newPointCount > 0)
			{
				var newPoints = [];
				for(var i = 0; i < newPointCount; i++)
				{
					var newX = view.getFloat32(offset, true);
					offset += 4;
					var newY = -view.getFloat32(offset, true);
					offset += 4;
					newPoints.push({x: newX*GAME_SCALE, y: newY*GAME_SCALE});
				}

				if(this.id != localPlayerID || !antiLagEnabled)
				{
					for(var i = newPointCount-1; i >= 0; i--)
					{
						this.points.unshift(newPoints[i]);
					}
					if(this.playSounds)
						soundManager.playSound(SOUND_TURN, VOLUME_TURN*lastDistVolume*masterVolume, 1.0, PLAY_RULE_ALWAYSPLAY, null);
				}else{
					//console.log("pendingConfirmationPointCount: " + pendingConfirmationPointCount);

					var fixPointNum = Math.min(pendingConfirmationPointCount, newPointCount);
					if(fixPointNum < 0)
						fixPointNum = 0;

					var offsetReplace = newPointCount-pendingConfirmationPointCount;
					//console.log('offsetReplace: ' + offsetReplace);
					for(var i = 0; i < fixPointNum; i++)
					{
						//console.log('Replacing point: ' + this.points[i+offsetReplace].x + ',' + this.points[i+offsetReplace].y);
						//console.log('With point: ' + newPoints[i].x + ',' + newPoints[i].y);
						if(newPoints[i+offsetReplace] == undefined)
						{
							// This fixes a crash issue
							//if(debug)
								//console.log('Issue ' + i + ',' + offsetReplace);
						}else{
							this.points[i] = newPoints[i+offsetReplace];
						}
					}
					for(var i = 0; i < (newPointCount - fixPointNum); i++)
					{
						//newPoints.splice(offsetReplace, 1);
						this.pointServerFix.unshift(newPoints[i]);
					}
					//console.log(this.pointServerFix);

					pendingConfirmationPointCount -= newPointCount;
				}
			}
		}


		//console.log('Total Points: ' + this.points.length + ' ServerCount: ' + curPointCount);
		var tmp = pendingConfirmationPointCount;
		if(tmp < 0)
			tmp = 0;
		var tmpPointCount = curPointCount + tmp;
		if(tmpPointCount < this.points.length)
		{
			this.points.splice(tmpPointCount+1, this.points.length - tmpPointCount - 1);
			//console.log('CUT: Total Points: ' + this.points.length + ' ServerCount: ' + curPointCount);
		}

		this.lastUpdateTime = now;

		return offset;
	};

	this.fixPoints = function(direction, x, y) {

		// Calc len after and before turn
		var len = CalcLength(x, y, this.dstX, this.dstY);
		var prevDelta = CalcLength(this.origX, this.origY, x, y);

		var directionVectorNorm = GetDirectionVector(direction);
		var directionVector = {x: directionVectorNorm.x*len, y: directionVectorNorm.y*len};
		//console.log('directionVector.x: ' + directionVector.x + ', directionVector.y: ' + directionVector.y);
		this.dstX = x + directionVector.x;
		this.dstY = y + directionVector.y;

		var directionVectorOrig = {x: directionVectorNorm.x*prevDelta, y: directionVectorNorm.y*prevDelta};
		this.origX = x - directionVectorOrig.x;
		this.origY = y - directionVectorOrig.y;
	}

	// Add immediate local turn
	this.setTurnPoint = function(direction, x, y) {
		pendingConfirmationPointCount++;

		if(this.pointServerFix.length > 0)
		{
			//console.log('Replacing ' + x + ',' + y + ' with ' + this.pointServerFix[0].x + ',' + this.pointServerFix[0].y);
			x = this.pointServerFix[0].x;
			y = this.pointServerFix[0].y;
			this.pointServerFix.splice(0, 1);
		}

		this.points.unshift({x: x, y: y});
		this.pendingDirection = direction;
		this.direction = direction;
		this.fixPoints(direction, x, y);
		if(this.playSounds)
			soundManager.playSound(SOUND_TURN, VOLUME_TURN*lastDistVolume*masterVolume, 1.0, PLAY_RULE_ALWAYSPLAY, null);
	}

	// Return last waiting turn point (local)
	this.findLastWaitingPoint = function(direction) {
		var prevPointX = this.x;
		var prevPointY = this.y;
		var distAcc = 0.0;
		for(var i = 0; i < waitingPointCount; i++)
		{
			var p = this.waitingPoints[i];
			distAcc += CalcLength(prevPointX, prevPointY, p.x, p.y);
			prevPointX = p.x;
			prevPointY = p.y;
			direction = p.d;
		}
		return {x: prevPointX, y: prevPointY, dist: distAcc, direction: direction};
	}

	// Add local turn to take place in 'delay' milliseconds
	this.addTurnPoint = function(direction, delay) {

		if(myPing > 300)
		{
			var extraDelay = myPing - 300;
			delay += extraDelay;
		}

		// Predict distance of turn from where we are now
		var distance = (delay * this.lastSpeed)/INTERP_TIME;

		// If more points are pending local turn, take that into account
		// Find that last point and return distance left
		var pointInfo = this.findLastWaitingPoint(this.direction);
		var distanceLeft = distance - pointInfo.dist;

		// Calculate position of new turn point
		var directionVectorNorm = GetDirectionVector(pointInfo.direction);
		var turnPointX = pointInfo.x + directionVectorNorm.x*distanceLeft;
		var turnPointY = pointInfo.y + directionVectorNorm.y*distanceLeft;

		// Add to list
		waitingPointCount++;
		this.waitingPoints.push({x: turnPointX, y: turnPointY, d: direction});

		//console.log('waitingPointCount: ' + waitingPointCount + ' X: ' + turnPointX + ', Y: ' + turnPointY);

		// Return it because it needs to be sent to the server
		return {x: turnPointX/GAME_SCALE, y: turnPointY/GAME_SCALE};
	}

	this.deleteNetwork = function(view, offset) {
		if(this.id == localPlayerID && killCount+1 >= KILLS_TO_FOLLOW) // +1 because wasKilled is only called after this
		{
			lastKillerID = this.killedByID;
			cameraSmooth = 30.0;
		}

		if(this.killedByID == localPlayerID && this.id == kingID && this.id != localPlayerID && isInGame)
		{
			hud.addSpecialMessage('YOU KILLED THE KING!', 30);
		}

		if(focus && this.killReason != KILL_REASON_LEFT_SCREEN){
			this.beingDeleted = true;
			
			// Don't like this
			if(this.id == localPlayerID)
			{
				camera.shake(7.0 + extraSpeed*0.13);
			}

			var collideX = view.getFloat32(offset, true);
			offset += 4;
			var collideY = -view.getFloat32(offset, true);
			offset += 4;

			if(this.killReason == KILL_REASON_SUICIDE)
			{
				dead = true;
			}else{
				collidePoint.x = collideX*GAME_SCALE;
				collidePoint.y = collideY*GAME_SCALE;

				afterDieDeltaPos.x = this.x - this.prevX;
				afterDieDeltaPos.y = this.y - this.prevY;
				afterDieDeltaPos = Normalize(afterDieDeltaPos.x, afterDieDeltaPos.y);
				afterDieDeltaPos.x *= speed2;
				afterDieDeltaPos.y *= speed2;
			}
			if(this.playSounds)
				soundManager.playSound(SOUND_CRASH, VOLUME_CRASH*lastDistVolume*masterVolume, 1.1, PLAY_RULE_ALWAYSPLAY, null);

			//console.log('afterDieDeltaPos.x: ' + afterDieDeltaPos.x + ', afterDieDeltaPos.y: ' + afterDieDeltaPos.y);

			return offset;
		}else{
			if(this.id == localPlayerID){
				input.direction = DIRECTION_UP;
				localPlayerID = 0;
				localPlayer = null;
				statKillReason = this.killReason;
			}
			offset += 4;
			offset += 4;
			delete entities[this.id];
			this.cleanup();
			return offset;
		}
	};

	this.resume = function() {
	};

	this.cleanup = function() {
		playerCount--;
		if(loopSound){
			if(this.playSounds)
			{
				soundManager.sound.stop(loopSound);
				soundManager.sound.stop(loopFastSound);
				soundManager.sound.stop(loopElectroSound);
				loopSound = null;
				loopFastSound = null;
			}
		}
	};

	this.setKilledBy = function(id) {
		this.killedByID = id;
	};

	this.setDead = function() {
		dead = true;
	};

	this.setRubSnakeID = function(snakeID) {
		rubSnakeID = snakeID;
	}

	this.setAlpha = function(a) {
		alpha = a;
	}

	this.onBlur = function() {
		if(this.playSounds)
		{
			soundManager.sound.volume(0, loopSound);
			soundManager.sound.volume(0, loopFastSound);
			soundManager.sound.volume(0, loopElectroSound);
		}
	}

	this.getTestValue = function() {
		//var w = this.getWidth();
		//return this.curLength*w;
		return 7;
	}

	this.getTalkTextByTalkID = function(talkID) {
		return talkTexts[talkID-1];
	}

	this.canTalk = function() {
		return this.talkStamina == 255;
	}
}
