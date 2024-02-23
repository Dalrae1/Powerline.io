var Resources = function() {

	// Textures
	this.loaded = false;
	this.onLoad = null;
	this.spriteSheetLoaded = false;
	this.gameSheet;
	this.frames = {};
	this.keysImage = null;
	this.boostImage = null;
	this.bgGrid = null;

	// KillStreak Skull Colors
	this.skullPurple = null;
	this.skullDarkBlue = null;
	this.skullRed = null;
	this.skullPurpleGlow = null;
	this.skullDarkBlueGlow = null;
	this.skullRedGlow = null;

	this.loadGameSpritesheet = function()
	{
		this.gameSheet = new Image();
		this.gameSheet.src = 'images/sheet.png?v=3';

		this.gameSheet.onload = function() {
			resources.loadGameSpritesheetFrames();
			resources.spriteSheetLoaded = true;

			resources.loadPatterns();

			resources.skullDarkBlue = resources.frames.skullbase.renderTintedFrame('#2a9de3');
			resources.skullDarkBlueGlow = resources.frames.skullglow.renderTintedFrame('#1931d6');

			resources.skullPurple = resources.frames.skullbase.renderTintedFrame('#c12ee5');
			resources.skullPurpleGlow = resources.frames.skullglow.renderTintedFrame('#0000FF');

			resources.skullRed = resources.frames.skullbase.renderTintedFrame('#ff2222');
			resources.skullRedGlow = resources.frames.skullglow.renderTintedFrame('#552255');

			resources.loaded = true;
			resources.onLoad();
		}

	}

	this.loadPatterns = function()
	{
		// Main Grid
		var gridCanvas = resources.frames.grid.renderToCanvas();
		resources.bgGrid = app.context.createPattern(gridCanvas, 'repeat');
	}

	this.loadGameSpritesheetFrames = function()
	{
		var frameLen = gameSheetInfo.length;
		for(var i = 0; i < frameLen; i++)
		{
			var frameInfo = gameSheetInfo[i];

			var frame = new Frame();
			frame.setFrameInfo(frameInfo, this.gameSheet);
			this.frames[frameInfo[0]] = frame;
		}
	}

	this.load = function(onLoad) {
		this.onLoad = onLoad;
		this.loadGameSpritesheet();

		// Load arrow keys tutorial
		this.keysImage = new Image();
		this.keysImage.src = 'images/arrows.png';
		this.keysImage.onload = function() {
		}

		// Load arrow keys tutorial
		this.boostImage = new Image();
		this.boostImage.src = 'images/close-to-boost-w.png';
		this.boostImage.onload = function() {
		}

	};

	this.loadTintImage = function(image, cb, style) {
		var c = document.createElement('canvas');
		var context = c.getContext('2d');

		var w = image.width;
		var h = image.height;
		c.width = w;
		c.height = h;

		// create offscreen buffer
		var buffer = document.createElement('canvas');
		buffer.width = w;
		buffer.height = h;
		var bx = buffer.getContext('2d');

		// fill offscreen buffer with the tint color
		bx.fillStyle = style;
		bx.fillRect(0, 0, buffer.width, buffer.height);

		// destination atop makes a result with an alpha channel identical to fg, but with all pixels retaining their original color *as far as I can tell*
		bx.globalCompositeOperation = "destination-atop";
		bx.drawImage(image, 0, 0);

		context.globalAlpha = 1.0;
		context.drawImage(buffer,0,0);

		cb(c);
	}

}
