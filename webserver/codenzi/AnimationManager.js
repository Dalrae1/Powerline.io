var AnimationManager = function() {

	var animationsInfo = {};
	var activeAnimations = [];
	var activeAnimationsLayer2 = [];
	var activeAnimationsBehind = [];
	var explosions = [];

	this.addAnimationInfo = function(name, animationInfo) {
		animationsInfo[name] = animationInfo;
	};

	this.setAnimationInterval = function(name, interval) {
		var ai = animationsInfo[name];
		ai.setInterval(interval);
	}

	this.createAnimation = function(animationName) {
		var animationInfo = animationsInfo[animationName];
		var animation = new Animation();
		animation.setup(animationInfo);
		return animation;
	};

	this.runAnimation = function(animation) {
		activeAnimations.push(animation);
	};

	this.runAnimationLayer2 = function(animation) {
		activeAnimationsLayer2.push(animation);
	};

	this.runAnimationBehind = function(animation) {
		activeAnimationsBehind.push(animation);
	};

	this.addBlast = function(posX, posY, scale, rule, volumeMult) {
		var animation = animationManager.createAnimation('explosion');
		animation.setScale(scale);
		animation.posX = posX;
		animation.posY = posY;
		animationManager.runAnimationBehind(animation);

		var d = distanceBetweenPoints(posX, posY, worldScreenCenter.x, worldScreenCenter.y);
		var volume = 1.0 - d/PLAY_DISTANCE;
		if(volume > 0.01)
			soundManager.playSound(SOUND_PLANE_EXPL, volume*volumeMult, 1.0, rule, null);

	}

	this.addExplosion = function(posX, posY, speedX, speedY) {
		if(!drawExplosions)
			return;
		
		if(!isPointVisible(posX, posY, 100) || !didDrawRecently()){
			return;
		}

		// 1 is the maximum number of explosions with particles
		if(explosions.length <= 1){
			var explosion = new Explosion();
			explosion.init(posX, posY, speedX, speedY);
			explosions.push(explosion);
		}

		this.addBlast(posX, posY, 1.0, PLAY_RULE_MAX3, 1.0);

		//camera.shake(); // TODO: Shake according to distance to center?
	};

	this.update = function(dt) {
		/*
		for(var animationID in activeAnimations)
		{
			var animation = activeAnimations[animationID];
			animation.update(dt);
			if(animation.deleting){
				activeAnimations.splice(animationID, 1);
				delete animation;
			}
		}

		for(var animationID in activeAnimationsBehind)
		{
			var animation = activeAnimationsBehind[animationID];
			animation.update(dt);
			if(animation.deleting){
				activeAnimationsBehind.splice(animationID, 1);
				delete animation;
			}
		}

		for(var animationID in activeAnimationsLayer2)
		{
			var animation = activeAnimationsLayer2[animationID];
			animation.update(dt);
			if(animation.deleting){
				activeAnimationsLayer2.splice(animationID, 1);
				delete animation;
			}
		}
		*/
		for(var explosionID in explosions)
		{
			var explosion = explosions[explosionID];
			explosion.update(dt);

			if(explosion.deleting){
				explosions.splice(explosionID, 1);
				delete explosion;
			}
		}
	};

	this.drawBehind = function(context) {
		for(var animationID in activeAnimationsBehind)
		{
			var animation = activeAnimationsBehind[animationID];
			context.save();
			context.translate(animation.posX, animation.posY);
			context.scale(animation.scaleX, animation.scaleY);
			context.rotate(animation.rotation);
			animation.draw(context);
			context.restore();
		}
	};


	this.drawLayer2 = function(context) {
		for(var animationID in activeAnimationsLayer2)
		{
			var animation = activeAnimationsLayer2[animationID];
			context.save();
			context.translate(animation.posX, animation.posY);
			context.scale(animation.scaleX, animation.scaleY);
			context.rotate(animation.rotation);
			animation.draw(context);
			context.restore();
		}
	};

	this.draw = function(context) {
		for(var animationID in activeAnimations)
		{
			var animation = activeAnimations[animationID];
			context.save();
			context.translate(animation.posX, animation.posY);
			context.scale(animation.scaleX, animation.scaleY);
			context.rotate(animation.rotation);
			animation.draw(context);
			context.restore();
		}
	};

	this.drawExplosions = function(context) {
		for(var explosionID in explosions)
		{
			var explosion = explosions[explosionID];
			explosion.draw(context);
		}
	};
}

var Animation = function() {

	var currentFrameIndex = 0;
	var interval = 0;
	var timeCount = 0.0;
	this.frames;
	this.frameCount = 0;
	this.deleting = false;
	this.posX = 0.0;
	this.posY = 0.0;
	this.scaleX = 1.0;
	this.scaleY = 1.0;
	this.rotation = 0.0;
	this.alpha = 1.0;

	this.copy = function(obj) {
	    var copy = new Animation();
	    copy.frames = this.frames;
	    copy.frameCount = this.frameCount;
	    copy.deleting = this.deleting;
	    copy.posX = this.posX;
	    copy.posY = this.posY;
	    copy.scaleX = this.scaleX;
	    copy.scaleY = this.scaleY;
	    copy.rotation = this.rotation;
	    copy.alpha = this.alpha;
	    copy.setInterval(interval);
	    return copy;
	};

	this.setup = function(animationInfo) {
		interval = animationInfo.interval;
		this.frames = animationInfo.frames;
		this.frameCount = animationInfo.frames.length;
	};

	this.setInterval = function(interval_) {
		interval = interval_;
	}

	this.update = function(dt) {
		if(this.deleting)
			return;

		// Increment frame according to time
		if(timeCount > interval){
			currentFrameIndex++;
			timeCount -= interval;
		}
		timeCount += dt;
		if(currentFrameIndex >= this.frameCount){
			this.deleting = true;
		}
	};

	this.setScale = function(scale) {
		this.scaleX = scale;
		this.scaleY = scale;
	};

	this.draw = function(context) {
		if(this.alpha < 1.0)
			context.globalAlpha = this.alpha;
		this.frames[currentFrameIndex].draw(context);
		
	};
}

var AnimationInfo = function() {

	this.frames = [];
	this.interval = 0;
	this.addFrame = function(frame) {
		this.frames.push(frame);
	};

	this.setInterval = function(interval_) {
		this.interval = interval_;
	}
}
