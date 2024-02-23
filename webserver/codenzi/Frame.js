var Frame = function() {

	this.width;
	this.height;
	var sx, sy;
	var anchorX, anchorY;
	var sheet = undefined;
	this.x = 0.0;
	this.y = 0.0;
	var offsetX;
	var offsetY;
	this.canvas;

	this.frameWithCanvas = function(c, oX, oY)
	{
		this.width = c.width;
		this.height = c.height;
		this.canvas = c;
		offsetX = oX;
		offsetY = oY;
	}

	this.setFrameInfo = function(frameInfo, gameSheet) {
		sheet = gameSheet;
		sx = frameInfo[1];
		sy = frameInfo[2];
		this.width = frameInfo[3];
		this.height = frameInfo[4];
		anchorX = frameInfo[5];
		anchorY = frameInfo[6];
		offsetX = -this.width*anchorX;
		offsetY = -this.height*anchorY;
	};

	this.draw = function(context) {
		if(sheet)
			context.drawImage(sheet, sx, sy, this.width, this.height, offsetX+this.x, offsetY+this.y, this.width, this.height);
		else{
			context.drawImage(this.canvas, 0, 0, this.width, this.height, offsetX+this.x, offsetY+this.y, this.width, this.height);
		}
	};


	this.renderTintedFrame = function(fillStyle) {
		var c = document.createElement('canvas');
		var context = c.getContext('2d');

		c.width = this.width;
		c.height = this.height;

        // create offscreen buffer
        var buffer = document.createElement('canvas');
        buffer.width = this.width;
        buffer.height = this.height;
        var bx = buffer.getContext('2d');

        // fill offscreen buffer with the tint color
        bx.fillStyle = fillStyle;
        bx.fillRect(0, 0, buffer.width, buffer.height);

        // destination atop makes a result with an alpha channel identical to fg, but with all pixels retaining their original color *as far as I can tell*
        bx.globalCompositeOperation = "destination-atop";
        bx.drawImage(sheet, sx, sy, this.width, this.height, 0, 0, this.width, this.height);

        context.globalAlpha = 1.0;
        context.drawImage(buffer,0,0);

        var frame = new Frame();
        frame.frameWithCanvas(c, offsetX, offsetY);
        return frame;
	}

	this.getImageCopy = function()
	{
        var canvasC = document.createElement("canvas");
        canvasC.width  = this.width;
        canvasC.height = this.height;
        var ctxC = canvasC.getContext('2d');
        ctxC.drawImage(sheet, sx, sy, this.width, this.height, 0, 0, this.width, this.height);
        var toC = ctxC.getImageData( 0, 0, this.width, this.height );
        var toDataC = toC.data;
        return {canvas: canvasC,
        		ctx: ctxC,
        		toData: toDataC,
        		to: toC
        	};
	}

    this.generateTintImage2 = function(r, g, b, t) {
		// create offscreen buffer
		var buffer = document.createElement('canvas');
		buffer.width = this.width;
		buffer.height = this.height;
		var myCtx = buffer.getContext('2d');

		myCtx.drawImage(sheet, sx, sy, this.width, this.height, 0, 0, this.width, this.height);

		var ctxBuffer = myCtx.getImageData(0, 0, this.width, this.height);
		var data = ctxBuffer.data;
		var len = data.length;


		for (var i = 0; i < len;) {
		    data[i] = data[i++] * (1-t) + (r*t);
		    data[i] = data[i++] * (1-t) + (g*t);
		    data[i] = data[i++] * (1-t) + (b*t);
		    data[i] = data[i++] * 0.8;
		}

		myCtx.putImageData(ctxBuffer, 0, 0);

		var frame = new Frame();
        frame.frameWithCanvas(buffer, offsetX, offsetY);
        return frame;
    }

    this.generateTintImage = function( rgbks, red, green, blue ) {
        var buff = document.createElement( "canvas" );
        buff.width  = this.width;
        buff.height = this.height;

        var ctx  = buff.getContext("2d");

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'copy';
        ctx.drawImage( rgbks[3], 0, 0 );

        ctx.globalCompositeOperation = 'lighter';
        if ( red > 0 ) {
            ctx.globalAlpha = red   / 255.0;
            ctx.drawImage( rgbks[0], 0, 0 );
        }
        if ( green > 0 ) {
            ctx.globalAlpha = green / 255.0;
            ctx.drawImage( rgbks[1], 0, 0 );
        }
        if ( blue > 0 ) {
            ctx.globalAlpha = blue  / 255.0;
            ctx.drawImage( rgbks[2], 0, 0 );
        }

        var frame = new Frame();
        frame.frameWithCanvas(buff, offsetX, offsetY);
        return frame;

        //return buff;
    }

	this.generateRGBKs = function() {
		var rgbks = [];
		var c = document.createElement('canvas');
		var context2D = c.getContext('2d');

		c.width = this.width;
		c.height = this.height;

		// create offscreen buffer
		var buffer = document.createElement('canvas');
		buffer.width = this.width;
		buffer.height = this.height;
		var myCtx = buffer.getContext('2d');

		myCtx.drawImage(sheet, sx, sy, this.width, this.height, 0, 0, this.width, this.height);

		var ctxBuffer = myCtx.getImageData(0, 0, this.width, this.height);
		var pixels = ctxBuffer.data;
		var len = pixels.length;

		// 4 Canvas, one for each image
		var imageCopyR = this.getImageCopy();
		var imageCopyG = this.getImageCopy();
		var imageCopyB = this.getImageCopy();
		var imageCopyK = this.getImageCopy();

		for (var i = 0; i < len; i += 4) {
			imageCopyR.toData[i  ] = pixels[i  ];
			imageCopyR.toData[i+1] = 0;
			imageCopyR.toData[i+2] = 0;
			imageCopyR.toData[i+3] = pixels[i+3]; // Really needed???

			imageCopyG.toData[i  ] = 0;
			imageCopyG.toData[i+1] = pixels[i+1];
			imageCopyG.toData[i+2] = 0;
			imageCopyG.toData[i+3] = pixels[i+3]; // Really needed???

			imageCopyB.toData[i  ] = 0;
			imageCopyB.toData[i+1] = 0;
			imageCopyB.toData[i+2] = pixels[i+2];
			imageCopyB.toData[i+3] = pixels[i+3]; // Really needed???

			imageCopyK.toData[i  ] = 0;
			imageCopyK.toData[i+1] = 0;
			imageCopyK.toData[i+2] = 0;
			imageCopyK.toData[i+3] = pixels[i+3]; // Really needed???
		}

		imageCopyR.ctx.putImageData( imageCopyR.to, 0, 0 );
		imageCopyG.ctx.putImageData( imageCopyG.to, 0, 0 );
		imageCopyB.ctx.putImageData( imageCopyB.to, 0, 0 );
		imageCopyK.ctx.putImageData( imageCopyK.to, 0, 0 );

        var imgCompR = new Image();
        imgCompR.src = imageCopyR.canvas.toDataURL();
        var imgCompG = new Image();
        imgCompG.src = imageCopyG.canvas.toDataURL();
        var imgCompB = new Image();
        imgCompB.src = imageCopyB.canvas.toDataURL();
        var imgCompK = new Image();
        imgCompK.src = imageCopyK.canvas.toDataURL();

        rgbks.push(imgCompR);
        rgbks.push(imgCompG);
        rgbks.push(imgCompB);
        rgbks.push(imgCompK);

        return rgbks;
	}

/*
	this.renderTintedFrame = function(fillStyle) {
		var c = document.createElement('canvas');
		var context2D = c.getContext('2d');

		c.width = this.width;
		c.height = this.height;

        // create new offscreen canvas
        var myCanvas = document.createElement('canvas');
        myCanvas.width = this.width;
        myCanvas.height = this.height;
        var myCtx = myCanvas.getContext('2d');

        // fill offscreen buffer with the tint color
        //bx.fillStyle = fillStyle;
        //bx.fillRect(0, 0, buffer.width, buffer.height);

        // destination atop makes a result with an alpha channel identical to fg, but with all pixels retaining their original color *as far as I can tell*
        //bx.globalCompositeOperation = "destination-atop";
        myCtx.drawImage(sheet, sx, sy, this.width, this.height, 0, 0, this.width, this.height);

		var ctxBuffer = myCtx.getImageData(0, 0, this.width, this.height);
		var data = ctxBuffer.data;
		var len = data.length;

		/// the color for addition
		var color = {r:0, g: 127, b: 0};

		/// loop through pixel array (RGBA = 4 bytes)
		for(var i = 0; i < len; i += 4) {
		    data[i]     = data[i]     + color.r;  /// add R
		    data[i + 1] = data[i + 1] + color.g;  /// add G
		    data[i + 2] = data[i + 2] + color.b;  /// add B
		}

		myCtx.putImageData(ctxBuffer, 0, 0);

        //context.globalAlpha = 1.0;
        context2D.drawImage(myCanvas,0,0);

        var frame = new Frame();

        frame.frameWithCanvas(c, offsetX, offsetY);
        return frame;
	}
*/
	this.renderToCanvas = function() {
		var canvas = document.createElement('canvas');
		var context = canvas.getContext('2d');

		canvas.width = this.width;
		canvas.height = this.height;

        // create offscreen buffer
        var buffer = document.createElement('canvas');
        buffer.width = this.width;
        buffer.height = this.height;
        var bx = buffer.getContext('2d');

        //bx.drawImage(sheet, sx, sy, this.width, this.height, 0, 0, this.width, this.height);
        //this.draw(bx);
		if(sheet)
			context.drawImage(sheet, sx, sy, this.width, this.height, 0, 0, this.width, this.height);
		else{
			context.drawImage(this.canvas, 0, 0, this.width, this.height, 0, 0, this.width, this.height);
		}

        context.globalAlpha = 1.0;
        context.drawImage(buffer,0,0);
        return canvas;
	}
}
