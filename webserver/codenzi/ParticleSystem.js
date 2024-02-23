var ParticleSystem = function() {

	var x = 0, y = 0;
	var color = {r:200, g:200, b:200, a:1.0};
	var rotation = 0;
	var scale = 1.0;
	var particles = [];
	var particleCount = 0;
	this.life = 400.0;
	var gravity = {};
	var speed = {};

	this.debreeAge = 0.0;
	this.alpha = 1.0;
	this.particleFrame;
	this.enabled = false;

	this.setEnabled = function(enabled) {
		if(!this.enabled)
		{
			// Note: this could pop out some particles if the system is
			// disabled and there were still some particles with life
			this.resetSystem();
		}
		this.enabled = enabled;
	}

	this.init = function(count, posX, posY) {
		particleCount = count;
		//life = 500.0; // milliseconds
		gravity.x = 0.0;
		gravity.y = 0.0;
		//gravity.y = -0.03;
		speed.x = 0.0;
		speed.y = 0.0;

		x = posX;
		y = posY;

		var timeDelay = this.life / particleCount;

		// Create Particles
		for(var i = 0; i < particleCount; i++)
		{
			var p = new Particle();
			this.resetParticle(p);
			p.active = false;

			//p.time = timeDelay*i;

			p.time = 9999; // Start disabled (quick hack)

			particles.push(p);
		}
	};

	this.resetSystem = function() {
		var timeDelay = this.life / particleCount;

		// Create Particles
		for(var i = 0; i < particleCount; i++)
		{
			var p = particles[i];
			this.resetParticle(p);
			p.active = false;
			p.time = timeDelay*i;
		}
	}

	this.resetParticle = function(p) {
		p.pos.x = x;
		p.pos.y = y;
		p.speed.x = speed.x;
		p.speed.y = speed.y;
		p.time = 0.0;
		p.color.a = 1.0;
		p.rotationSpeed = (Math.random()-0.5)/10;
		p.rotation = Math.random()*360.0;
	};

	this.update = function(dt) {
		dt = 1000.0/60.0; // Fixed framerate
		var timeCorrection = 1.0; //dt*(60.0/1000.0);
		//if(dt > 20){
			// Ugly hack, but works (?)
			// No. After some time ends up creating spaces... we need to only allow particle birth after correct timming
			//return;
		//}

		for(var i = 0; i < particleCount; i++)
		{
			var p = particles[i];

			if(p.time >= this.life)
			{
				if(!p.active) {
					p.active = true;
					p.time = p.time%this.life;
				}

				// Set init parameters
				if(this.enabled)
					this.resetParticle(p);
			}

			p.time += dt;

			if(p.active)
			{

				var age = p.time/this.life; // From 0.0 to 1.0
				if(age > 1.0)
					age = 1.0;

				// Update Position
				p.pos.x += p.speed.x*timeCorrection;
				p.pos.y += p.speed.y*timeCorrection;

				// Update scale
				//p.scale = 0.1 + age*0.6;
				var scaleInAge = 0.1;
				var beginScale = 0.4;
				if(age >= 0.0 && age < scaleInAge)
				{
					var factor = age/scaleInAge;
					//p.scale = 0.15 + age*0.2;
					p.scale = beginScale;
				}else{
					p.scale = beginScale + (age - scaleInAge)*0.3;
					//p.scale = beginScale;
				}

				// Update rotation
				p.rotation += p.rotationSpeed;

				// Update transparency
				var fadeInAge = 0.1;
				var fadeOutAge = 0.5;
				p.color.a = 1.0;
				if(age >= 0.0 && age < fadeInAge)
				{
					var factor = age/fadeInAge;
					//if(factor > 0.8)
						//factor = 0.8;
					p.color.a = factor;
				}else if(age > fadeOutAge){
					p.color.a = 1.0 - (age - fadeOutAge)/(1.0 - fadeOutAge);
					//console.log('age: ' + age + ' ::: ' + p.color.a);
				}
				p.color.a *= this.alpha;
				
				// Color
				/*
				var colorRedAge = 0.25;
				var colorGrayAge = 0.3;
				if(age >= 0.0 && age < colorRedAge)
				{
					var factor = age/colorRedAge;
					p.color.h = 61*(1.0 - factor);
					p.color.s = '100%';
					p.color.l = '50%';
				}else if(age >= colorRedAge && age <= colorGrayAge){
					var factor = (age-colorRedAge)/(colorGrayAge-colorRedAge);
					p.color.h = 0;
					var percSaturation = ((1.0-factor)*100);
					p.color.s = percSaturation+'%';
					p.color.l = '50%';
					//var percLightness = (0.4+((1.0-factor)*0.1))*100;
					//p.color.l = percLightness+'%';
				}
				*/

				// Update Speed
				p.speed.x += gravity.x*timeCorrection;
				p.speed.y += gravity.y*timeCorrection;
			}
		}
	};

	this.setPosition = function(posX, posY) {
		x = posX;
		y = posY;
	};

	this.setLife = function(_life) {
		this.life = _life;
	};

	this.draw = function(context) {
		for(var i = particleCount-1; i >= 0; i--)
		//for(var i = 0; i < particleCount; i++)
		{
			var p = particles[i];
			if(p.active)
				p.draw(context, this.particleFrame);
		}
	};
}
