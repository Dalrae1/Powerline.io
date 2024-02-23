var Particle = function() {

	// RGB Tests
	//this.color = {r:200, g:200, b:200, a:1.0};

	// HSL Tests
	this.color = {h:'61', s:'100%', l:'100%', a:1.0};

	this.rotation = 0;
	this.scale = 1.0;
	this.pos = {x:0, y:0};

	// Used by ParticleSystem
	this.speed = {x:0, y:0};
	this.time = 0.0;
	this.active = false;
	this.used = false;
	this.rotationSpeed = 0.0;

	this.draw = function(context, particleFrame) {

		context.save();

		context.translate(this.pos.x, this.pos.y);
		context.scale(this.scale, this.scale);
		context.rotate(this.rotation);

		var style = 'hsla('+this.color.h+','+this.color.s+','+this.color.l+','+this.color.a+')';
		context.translate(10, -2);

		context.globalAlpha = this.color.a;
		particleFrame.draw(context);
		//resources.frames.particleDot.draw(context);
		
		// Big Circle
		/*
		context.beginPath();
		context.arc(0, 0, 25.0, 0, 2 * Math.PI, false);
		context.fillStyle = style;
		context.fill();
		*/

		/*// Medium Circle
		context.beginPath();
		context.arc(-27, -12, 14.0, 0, 2 * Math.PI, false);
		context.fillStyle = style;
		context.fill();*/

		// Small Circle
		/*
		context.beginPath();
		context.arc(-15, -32, 7.0, 0, 2 * Math.PI, false);
		context.fillStyle = style;
		context.fill();
		*/

		context.restore();
	};
}
