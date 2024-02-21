var Explosion = function() {

	this.deleting = false;
	var debrees = [];
	var x, y;
	var time = 0.0;
	//var centerParticle;

	function randomAngle(angle)
	{
		return Math.random()*angle-angle/2;
	}

	this.init = function(posX, posY, speedX, speedY) {
		x = posX;
		y = posY;

		var rndVal1 = 2.0+Math.random()*4.0;
		var rndVal2 = 2.0+Math.random()*4.0;
		var rndVal3 = 2.0+Math.random()*4.0;
		var rndVal4 = 2.0+Math.random()*4.0;

		var randFOV = Math.PI/4;
		var rootRotation = randomAngle(Math.PI/2);

		//var rndParticles = Math.random()*2;

		/*if(parseInt(rndParticles) == 0){

			var angle1 = randomAngle(randFOV)+rootRotation;
			var dir1X = Math.cos(angle1);
			var dir1Y = Math.sin(angle1);

			var angle2 = Math.PI/2 + randomAngle(randFOV)+rootRotation;
			var dir2X = Math.cos(angle2);
			var dir2Y = Math.sin(angle2);

			var angle3 = Math.PI + randomAngle(randFOV)+rootRotation;
			var dir3X = Math.cos(angle3);
			var dir3Y = Math.sin(angle3);

			var angle4 = Math.PI*1.5 + randomAngle(randFOV)+rootRotation;
			var dir4X = Math.cos(angle4);
			var dir4Y = Math.sin(angle4);

			this.addDebree(dir1X*rndVal1+speedX, dir1Y*rndVal1+speedY);
			this.addDebree(dir2X*rndVal2+speedX, dir2Y*rndVal2+speedY);
			this.addDebree(dir3X*rndVal3+speedX, dir3Y*rndVal3+speedY);
			this.addDebree(dir4X*rndVal4+speedX, dir4Y*rndVal4+speedY);
		}else{*/

			var angle1 = randomAngle(randFOV)+rootRotation;
			var dir1X = Math.cos(angle1);
			var dir1Y = Math.sin(angle1);

			var angle2 = Math.PI*(2/3) + randomAngle(randFOV)+rootRotation;
			var dir2X = Math.cos(angle2);
			var dir2Y = Math.sin(angle2);

			var angle3 = Math.PI*(4/3) + randomAngle(randFOV)+rootRotation;
			var dir3X = Math.cos(angle3);
			var dir3Y = Math.sin(angle3);

			this.addDebree(dir1X*rndVal1+speedX, dir1Y*rndVal1+speedY);
			this.addDebree(dir2X*rndVal2+speedX, dir2Y*rndVal2+speedY);
			this.addDebree(dir3X*rndVal3+speedX, dir3Y*rndVal3+speedY);
		//}

		//centerParticle = new Particle();
		//centerParticle.pos.x = posX;
		//centerParticle.pos.y = posY;
		//centerParticle.rotation = Math.random()*360;
	};

	this.addDebree = function(sX, sY) {
		var debree = new Debree();
		debree.init(x, y)
		debree.setSpeed(sX, sY);
		debrees.push(debree);
	};

	this.update = function(dt) {
		var debreeCount = 0;

		/*
		if(centerParticle)
		{
			// Update center particle
			var duration = 200;
			var age = time/duration;

			if(time <= duration)
			{
				// Update transparency
				var fadeInAge = 0.7;
				if(age >= 0.0 && age < fadeInAge)
				{
					var factor = age/fadeInAge;
					centerParticle.color.a = 1.0;
				}else{
					centerParticle.color.a = 1.0-(age - fadeInAge)/(1.0 - fadeInAge);
				}

				// Update Scale
				var scaleInAge = 0.1;
				var midScale = 0.6;
				if(age >= 0.0 && age < scaleInAge)
				{
					var factor = age/scaleInAge;
					centerParticle.scale = factor*midScale;
				}else{
					centerParticle.scale = midScale + (age - scaleInAge)/(1.0 - scaleInAge)*0.6;
				}

				// Update Color
				var yellowTingAge = 0.3;
				if(age > yellowTingAge)
				{
					centerParticle.color.l = (50 + (50 - ((age - yellowTingAge)/(1.0 - yellowTingAge))*50)) + '%';
				}
			}else{
				delete centerParticle;
				centerParticle = null;
			}
		}*/

		for(debreeID in debrees)
		{
			var debree = debrees[debreeID];
			debree.update(dt);

			if(debree.deleting){
				debrees.splice(debreeID, 1);
				delete debree;
			}
			debreeCount++;
		}
		if(debreeCount == 0)
			this.deleting = true;
		time += dt;
	};



	this.draw = function(context) {
		// Draw center flash+flame
		//if(centerParticle)
		//	centerParticle.draw(context);

		for(debreeID in debrees)
		{
			var debree = debrees[debreeID];
			debree.draw(context);
		}
	};
}

var Debree = function() {
	var speedX, speedY, speedGravity;
	var minSpeedX, minSpeedY;
	var maxSpeedGravity = 3.0;
	var gravity = 0.08;
	if(gameEvent.isSpaceWars())
		gravity = 0.0;
	var minGravity = 0.008;
	var x, y;
	var pSystem;
	var debreeAge = 0.0;
	this.deleting = false;
	var airDamping = 0.975;

	this.init = function(posX, posY) {
		x = posX;
		y = posY;
		pSystem = new ParticleSystem();
		pSystem.init(15, x, y);
	};

	this.setSpeed = function(sX, sY) {
		speedX = sX;
		speedY = sY;
		speedGravity = 0.0;
		minSpeedX = speedX*0.2;
		minSpeedY = speedY*0.2;
	};

	this.update = function(dt) {
		speedGravity += gravity;
		x += speedX;
		y += speedY + speedGravity;

		speedX *= airDamping;
		speedY *= airDamping;
		gravity *= airDamping;
		if(Math.abs(speedX) < Math.abs(minSpeedX))
			speedX = minSpeedX;
		if(Math.abs(speedY) < Math.abs(minSpeedY))
			speedY = minSpeedY;
		if(speedGravity > maxSpeedGravity)
			speedGravity = maxSpeedGravity;

		debreeAge += dt;
		var ageBeginTime = 500.0;
		var ageEndTime = 2300.0;
		var fadeOutEndTime = 2500.0;
		if(debreeAge > ageBeginTime && debreeAge <= ageEndTime){

			var ageVal = (debreeAge - ageBeginTime)/ageEndTime;
			pSystem.debreeAge = ageVal;
			//console.log(ageVal);
		}else if(debreeAge > ageEndTime && debreeAge <= fadeOutEndTime)
		{
			pSystem.alpha = (fadeOutEndTime - debreeAge)/(fadeOutEndTime - ageEndTime);
			//console.log(pSystem.alpha);
		}else if(debreeAge > fadeOutEndTime){
			delete pSystem;
			this.deleting = true;
		}

		if(!this.deleting){
			pSystem.setPosition(x, y);
			pSystem.updateExplosion(dt);
		}
	};

	this.draw = function(context) {
		if(!this.deleting)
			pSystem.draw(context);	
	};
}