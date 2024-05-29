var Food = function() {
	var food = this;

	this.id = -1;
	this.x = 0;
	this.y = 0;
	this.prevX = 0;
	this.prevY = 0;
	this.origX = 0;
	this.origY = 0;
	this.dstX = 0;
	this.dstY = 0;
	this.energy = 255;

	this.nick = '';
	this.hue = 0;
	this.lastUpdateTime;
	this.killedByID = 0;

	var t = 0;
	var style;
	var renderedFrame;

	var grabVal = 0.0;
	this.beingDeleted = false;
	this.canInterpolate = false;
	this.blendIn = 0.0;
	this.killedByID = 0;
	this.beginGrabX = 0;
	this.beginGraby = 0;
	var addRotation = 0;
	var baseRotation = Math.random()*Math.PI;
	var rndSign = Math.random()>0.5?1:-1;
	var bornValue = 0.0;
	var alpha = 1.0;

	this.playSounds = true;
	this.tutorial = false;

	this.update = function(dt) {
		var dt_fix = dt*(60.0/1000.0);
		if(!this.beingDeleted)
		{
			if(bornValue < 1.0)
			{
				bornValue += 0.03*dt_fix;
				if(bornValue > 1.0)
					bornValue = 1.0;
			}

			var t = clamp((now - this.lastUpdateTime) / INTERP_TIME, 0.0, 1.0);

			// Interpolate car pose
			this.prevX = this.x;
			this.prevY = this.y;
			var newPosX = t * (this.dstX - this.origX) + this.origX;
			var newPosY = t * (this.dstY - this.origY) + this.origY;
			this.x = newPosX;
			this.y = newPosY;
		}else{
			var killerEntity = entities[this.killedByID];
			if(killerEntity)
			{
				var grabValCurved = Math.pow(grabVal, 2);
				var grabCenterX, grabCenterY;
				grabCenterX = killerEntity.x;
				grabCenterY = killerEntity.y;
				this.x = this.beginGrabX + (grabCenterX - this.beginGrabX)*grabValCurved;
				this.y = this.beginGrabY + (grabCenterY - this.beginGrabY)*grabValCurved;

				grabVal += 0.07*dt_fix;
				if(grabVal > 1.0){
					delete entities[this.id];
				}
			}else{
				grabVal += 0.07*dt_fix;
				if(grabVal > 1.0){
					delete entities[this.id];
				}
			}
		}
		if(this.beingDeleted){
			addRotation += 0.2;
		}
	};

	this.drawAfter = function(context) {
	};

	this.draw = function(context) {
		if(/*!this.canInterpolate || */!drawFood)
			return;

		// Draw text
		if (localPlayer && localPlayer.nick == "DebugSnake") {
			context.save();
			context.fillStyle = '#FFFFFFFF';
			context.font = '10px Arial';
			context.textAlign = 'center';
			context.fillText(this.id, this.x, this.y+10);
			context.scale(1.7, 1.7);
			context.restore()
		}
			
		// Draw Food
		var w = 3*GAME_SCALE;
		var h = 3*GAME_SCALE;
		context.save();
		context.translate(this.x, this.y);

		if(0){
			var r = 1.5*GAME_SCALE;
			context.fillStyle = '#BBBB00';
			context.lineWidth = 1;
			context.strokeStyle = '#888800';
			context.beginPath();
			context.arc(0, 0,r,0,2*Math.PI);
			context.fill();
			context.stroke();
			context.closePath();
		}

		t += 0.05;
		var baseScale = 0.2;
		var s1 = baseScale-Math.sin(t)*0.02;
		var s2 = baseScale-Math.sin(t)*0.02;

		var s = 3/4;
		var k = s*(Math.PI);
		var scaleEffect = Math.sin(Math.sqrt(bornValue)*k)/s;
		context.scale(s1*scaleEffect, s2*scaleEffect);

		context.rotate((Math.PI/4 + t/15 + baseRotation + bornValue*2.0)*rndSign);
		if(this.beingDeleted){
			context.rotate(addRotation);
			if(this.killedByID > 0)
			{
				context.scale(1.7, 1.7);
			}else{
				context.scale(1.0 - grabVal, 1.0 - grabVal);
			}
		}

		context.globalAlpha = alpha;
		renderedFrame.draw(context);
		context.globalAlpha = 1;
		context.restore();
	};

	this.drawInput = function(context) {
	};

	this.drawInfo = function(context) {
	};

	this.updateNetwork = function(view, offset, isFull) {
		var curX;
		var curY;

		curX = view.getFloat32(offset, true);
		//console.log('curX ' + curX);
		offset += 4;
		curY = -view.getFloat32(offset, true);
		//console.log('curY ' + curY);
		offset += 4;

		this.origX = this.x;
		this.origY = this.y;

		this.dstX = curX*GAME_SCALE;
		this.dstY = curY*GAME_SCALE;

		// Do not interpolate, it just appeared on screen
		if(isFull)
		{
			//console.log('Create food: ' + this.id);

			this.origX = this.dstX;
			this.origY = this.dstY;
			this.x = this.dstX;
			this.y = this.dstY;

			this.hue = view.getUint16(offset, true);
			offset += 2;

			style = 'hsl('+this.hue+', 100%, 50%)'
			renderedFrame = resources.frames.food.renderTintedFrame(style);
		}else{
			this.canInterpolate = true;
		}

		this.lastUpdateTime = now;

		return offset;
	};

	this.deleteNetwork = function(view, offset) {
		//console.log('Delete food: ' + this.id);
		if(focus)
		{
			this.beingDeleted = true;
			this.beginGrabX = this.x;
			this.beginGrabY = this.y;
			if(this.killedByID > 0 && this.playSounds){
				lastDistVolume = GetVolumeAtPoint(this.x, this.y);
				soundManager.playSound(SOUND_FOOD_GRAB, VOLUME_FOOD_GRAB*lastDistVolume*masterVolume, 1.5, PLAY_RULE_ALWAYSPLAY, null);
			}

			return offset;
		}else{
			delete entities[this.id];
			return offset;
		}
	};

	this.resume = function() {
	};

	this.cleanup = function() {
	};

	this.setKilledBy = function(id) {
		this.killedByID = id;
	};

	this.setAlpha = function(a) {
		alpha = a;
	};
}
