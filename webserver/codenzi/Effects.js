var Effects = function() {

	var shots = [];
	var explosions = [];
	//var missileImpacts = [];

	function drawShot(context, begin, end) {

		var side1X, side1Y;
		var side2X, side2Y;

		var percSidesAt = 0.05;

		var deltaX = end.x - begin.x;
		var deltaY = end.y - begin.y;

		var centerSideX = begin.x + deltaX*percSidesAt;
		var centerSideY = begin.y + deltaY*percSidesAt;

		var deltaLength = Math.sqrt(deltaX*deltaX + deltaY*deltaY);
		deltaX /= deltaLength;
		deltaY /= deltaLength;

		// Shot Width
		deltaX *= 3.0;
		deltaY *= 3.0;

		side1X = centerSideX + (-deltaY);
		side1Y = centerSideY + deltaX;
		side2X = centerSideX - (-deltaY);
		side2Y = centerSideY - deltaX;

		context.moveTo(begin.x, begin.y);
		context.lineTo(side1X, side1Y);
		context.lineTo(end.x, end.y);
		context.lineTo(side2X, side2Y);
	};

	// WARNING: there should be a this.update !!!
	this.draw = function(context) {

		/*
		// Draw Missile Impacts
		var deletingImpacts = [];
		for (var i = 0; i < missileImpacts.length; i++) {

			var missileImpact = missileImpacts[i];

			missileImpact.time -= 0.1;

			if(missileImpact.time > 0.0){
				context.beginPath();
				context.fillStyle = 'rgba(255,0,0,1.0)';
				context.arc(missileImpact.position.x, missileImpact.position.y,missileImpact.time*20,0,2*Math.PI);
				context.closePath();
				context.fill();
			}else{
				deletingImpacts.push(missileImpact);
			}

		}
		for (var e = 0; e < deletingImpacts.length; e++) {
			var index = missileImpacts.indexOf(deletingImpacts[e]);
			missileImpacts.splice(index, 1);
		}
		deletingImpacts.length = 0;
		*/
		// Draw Shots
		var deletingExplosions = [];
		var explosionLen = explosions.length;
		for (var i = 0; i < explosionLen; i++) {
			var explosion = explosions[i];

			explosion.a -= 0.10;
			if(explosion.a > 0.0){
				context.save();
				context.beginPath();
				context.fillStyle = 'rgba(255,0,0,1.0)';
				context.globalAlpha = explosion.a;
				context.arc(explosion.x, explosion.y,(Math.sqrt(1.0 - explosion.a))*GAME_SCALE*5.0,0,2*Math.PI);
				context.closePath();
				context.fill();
				context.restore();
			}else{
				deletingExplosions.push(explosion);
			}

		}

		for (var e = 0; e < deletingExplosions.length; e++) {
			var index = explosions.indexOf(deletingExplosions[e]);
			explosions.splice(index, 1);
		}
		deletingExplosions.length = 0;
	};

	this.addExplosion = function(x, y) {
		var explosion = {};
		explosion.x = x;
		explosion.y = y;
		explosion.a = 1.0;
		explosions.push(explosion);
	};

	this.addShot = function(id, hitX, hitY, weaponType) {
		if(!didDrawRecently() || !firstClick){
			return;
		}

		var player = players[id];
		if(!player)
			return;


		var shot = {};
		shot.id = id;
		shot.angle = player.angle;
		shot.isKing = (currentKingID == id);
		shot.hitPosition = {
			x: hitX*GAME_SCALE,
			y: hitY*GAME_SCALE
		};

		shot.special = 0;
		if(gameEvent.isInstagib())
			shot.special = 1;
		else if(gameEvent.isSpaceWars())
			shot.special = 2;
		shot.a = 1.0;
		shot.weapon = weaponType;

		// Get origin position
		var origX, origY
		var vectorShiftX = 0.0;
		var vectorShiftY = -10.0;

		var rotatedVectorShift = rotateVector(vectorShiftX, vectorShiftY, player.angle)
		origX = player.x + rotatedVectorShift.x;
		origY = player.y + rotatedVectorShift.y;

		shot.origPosition = {
			x: origX,
			y: origY
		};

		var directionX = shot.hitPosition.x - origX;
		var directionY = shot.hitPosition.y - origY;

		if(weaponType != WEAPON_LASER)
		{
			var distance = Math.sqrt(directionX*directionX + directionY*directionY);
			var directionNormalizedX = directionX/distance;
			var directionNormalizedY = directionY/distance;

			shot.direction = {
				x: directionNormalizedX,
				y: directionNormalizedY
			};

			shot.curPosition = {
				x: origX,
				y: origY
			};

			shot.finish = false;

			if(isPointVisible(origX, origY, 100) || isPointVisible(shot.hitPosition.x, shot.hitPosition.y, 100))
			{
				shots.push(shot);
			}

		}

		var waterLevel = areaHeight/2.0;
		if(shot.hitPosition.y > waterLevel)
		{

			var m = directionY/directionX;
			var b = shot.hitPosition.y - (m*shot.hitPosition.x);

			effects.addSplash((waterLevel-b)/m, waterLevel + 6.0, 1.0, false);
		}
	};

	this.addMissileImpact = function(hitX, hitY) {

		var pX = hitX*GAME_SCALE;
		var pY = hitY*GAME_SCALE;
		if(!isPointVisible(pX, pY, 100) || !didDrawRecently())
		{
			return;
		}

		var animation = animationManager.createAnimation('explosion');
		animation.setScale(1.0);
		animation.posX = hitX*GAME_SCALE;
		animation.posY = hitY*GAME_SCALE;
		animationManager.runAnimationBehind(animation);

		var d = distanceBetweenPoints(pX, pY, worldScreenCenter.x, worldScreenCenter.y);
		var volume = 1.0 - d/PLAY_DISTANCE;
		soundManager.playSound(SOUND_MISSILE_EXPL, volume, 1.0, PLAY_RULE_MAX3, null);
	};

	this.addSplash = function(x, y, scale, randScaleX) {
			if(!drawSplashes)
				return;

			if(gameEvent.isSpaceWars())
				return;

			if(!isPointVisible(x, y, 100) || !didDrawRecently())
			{
				return;
			}

			var animation = animationManager.createAnimation('splash');
			var animationReflex = animationManager.createAnimation('splashReflex');
			var animationHeight = 61;

			animation.setScale(scale);
			if(randScaleX)
				animation.scaleX *= (1.2 + 0.4*Math.random());
			animation.posX = x;
			animation.posY = y - (animation.scaleY*animationHeight)/2.0;
			//var fps = (19+Math.random()*4);
			//animation.setInterval(1000.0/fps);
			animationManager.runAnimation(animation);

			// Water Reflection
			animationReflex.scaleX = animation.scaleX;
			animationReflex.posX = animation.posX;
			animationReflex.posY = animation.posY + 77.0;
			animationReflex.scaleY = -2.0;
			//animationCopy.alpha = 0.2;
			animationManager.runAnimationLayer2(animationReflex);

	};
}
