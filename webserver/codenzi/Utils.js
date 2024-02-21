var mainFont = 'Arial Black';

function GetVolumeAtPoint(x, y)
{
	var PLAY_DISTANCE = 400.0;
	var d = distanceBetweenPoints(x, y, worldScreenCenter.x, worldScreenCenter.y);
	return Math.max(0.0, Math.min(1.0, 1.0 - d/PLAY_DISTANCE));
}

function GetDirectionVector(direction)
{
    switch(direction)
    {
        case DIRECTION_UP:
            return {x: 0, y: -1};
            break;
        case DIRECTION_LEFT:
            return {x: -1, y: 0};
            break;
        case DIRECTION_RIGHT:
            return {x: 1, y: 0};
            break;
        case DIRECTION_DOWN:
            return {x: 0, y: 1};
            break;
        default:
            break;
    }
    return b2Vec2(0, 0);
}

function Clamp(a,b,c)
{
	return Math.max(b,Math.min(c,a));
}

function RandomWithRange(min, max)
{
   var range = (max - min) + 1;     
   return (Math.random() * range) + min;
}

function CalcLength(p1x, p1y, p2x, p2y)
{
	var dx = p1x-p2x;
	var dy = p1y-p2y;
	return Math.sqrt(dx*dx+dy*dy);
}

function VectorLength(x, y)
{
	return Math.sqrt(x*x+y*y);
}

function Normalize(px, py)
{
	var len = Math.sqrt(px*px+py*py);
	px /= len;
	py /= len;
	return {x:px, y:py};
}

function getString(view, offset)
{
	var nick = "";
	for(;;){
		var v = view.getUint16(offset, true);
		offset += 2;
		if(v == 0) {
			break;
		}

		nick += String.fromCharCode(v);
	}
	return {
		nick: nick,
		offset: offset
	};
}

function digitZero(number)
{
	var prependStr = "";
	if(number < 10)
		prependStr = "0";

	return prependStr + parseInt(number);
}

function formatTime(milliseconds)
{
	var totalSeconds = parseInt(milliseconds/1000);

	var totalMinuteValue = totalSeconds/60;
	var totalMinutes = parseInt(totalMinuteValue);
	var seconds = totalSeconds - totalMinutes*60;

	var totalHoursValue = totalMinutes/60;
	var totalHours = parseInt(totalHoursValue);
	var minutes = totalMinutes - totalHours*60;

	if(totalHours == 0)
		return digitZero(minutes)+':'+digitZero(seconds);
	else
		return digitZero(totalHours)+':'+digitZero(minutes)+':'+digitZero(seconds);
}

function textureMap(ctx, texture, pts) {
    var tris = [[0, 1, 2], [2, 3, 0]]; // Split in two triangles
    for (var t=0; t<2; t++) {
        var pp = tris[t];
        var x0 = pts[pp[0]].x, x1 = pts[pp[1]].x, x2 = pts[pp[2]].x;
        var y0 = pts[pp[0]].y, y1 = pts[pp[1]].y, y2 = pts[pp[2]].y;
        var u0 = pts[pp[0]].u, u1 = pts[pp[1]].u, u2 = pts[pp[2]].u;
        var v0 = pts[pp[0]].v, v1 = pts[pp[1]].v, v2 = pts[pp[2]].v;

        // Set clipping area so that only pixels inside the triangle will
        // be affected by the image drawing operation
        ctx.save(); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2); ctx.closePath(); ctx.clip();

        // Compute matrix transform
        var delta = u0*v1 + v0*u2 + u1*v2 - v1*u2 - v0*u1 - u0*v2;
        var delta_a = x0*v1 + v0*x2 + x1*v2 - v1*x2 - v0*x1 - x0*v2;
        var delta_b = u0*x1 + x0*u2 + u1*x2 - x1*u2 - x0*u1 - u0*x2;
        var delta_c = u0*v1*x2 + v0*x1*u2 + x0*u1*v2 - x0*v1*u2
                      - v0*u1*x2 - u0*x1*v2;
        var delta_d = y0*v1 + v0*y2 + y1*v2 - v1*y2 - v0*y1 - y0*v2;
        var delta_e = u0*y1 + y0*u2 + u1*y2 - y1*u2 - y0*u1 - u0*y2;
        var delta_f = u0*v1*y2 + v0*y1*u2 + y0*u1*v2 - y0*v1*u2
                      - v0*u1*y2 - u0*y1*v2;

        // Draw the transformed image
        ctx.transform(delta_a/delta, delta_d/delta,
                      delta_b/delta, delta_e/delta,
                      delta_c/delta, delta_f/delta);
        ctx.drawImage(texture, 0, 0);
        ctx.restore();
    }
}

function isFullscreen() {
	return !(!document.fullscreenElement &&    // alternative standard method
      !document.mozFullScreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement);
}

function toggleFullScreen() {
  if (!isFullscreen()) {  // current working methods
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    } else if (document.documentElement.msRequestFullscreen) {
      document.documentElement.msRequestFullscreen();
    } else if (document.documentElement.mozRequestFullScreen) {
      document.documentElement.mozRequestFullScreen();
    } else if (document.documentElement.webkitRequestFullscreen) {
      document.documentElement.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
}

function distanceBetweenPoints(x1, y1, x2, y2)
{
	return Math.sqrt((x2-x1)*(x2-x1) + (y2-y1)*(y2-y1));
}

function didDrawRecently()
{
	var nownow = +new Date();
	return nownow - now < 50;
}

function isPointVisible(x, y, radius)
{
	var bounds = camera.getBounds();
	if(x+radius >= bounds[0].x && x-radius <= bounds[1].x && y+radius >= bounds[0].y && y-radius <= bounds[1].y)
		return true;
	else
		return false;
}

function checkInterceptingAABB(AABB1TopX, AABB1TopY, AABB1BottomX, AABB1BottomY, AABB2TopX, AABB2TopY, AABB2BottomX, AABB2BottomY)
{
	if(AABB1TopX > AABB2BottomX ||
		AABB1BottomX < AABB2TopX ||
		AABB1TopY > AABB2BottomY ||
		AABB1BottomY < AABB2TopY)
		return false;
	else
		return true;
}

function clamp(v, min, max){
	if(v < min) return min;
	if(v > max) return max;
	return v;
}

function smoothTrail(x){
	return Math.sqrt(x, 3);
}

function CachedText(size, color, stroke, strokeColor){
	if(size) this._size = size;
	if(color) this._color = color;
	this._stroke = !!stroke;
	if(strokeColor) this._strokeColor = strokeColor;
}

function Cached3DText(size, color, secondColor){
	if(size) this._size = size;
	if(color) this._color = color;
	if(secondColor) this._secondColor = secondColor;
}

function getPlayerName(name)
{
	var playerName = name;
	if(playerName == '')
		playerName = '<Unnamed>';
	return playerName;
}

function drawRoundedRectangle(ctx,x,y,w,h,r) {
	var r = r / 2;
	ctx.beginPath();
	ctx.moveTo(x, y+r);
	ctx.lineTo(x, y+h-r);
	ctx.quadraticCurveTo(x, y+h, x+r, y+h);
	ctx.lineTo(x+w-r, y+h);
	ctx.quadraticCurveTo(x+w, y+h, x+w, y+h-r);
	ctx.lineTo(x+w, y+r);
	ctx.quadraticCurveTo(x+w, y, x+w-r, y);
	ctx.lineTo(x+r, y);
	ctx.quadraticCurveTo(x, y, x, y+r);
	ctx.closePath();
	ctx.fill();
}

function drawLeftRoundedRectangle(ctx,x,y,w,h,r) {
	var r = r / 2;
	ctx.beginPath();
	ctx.moveTo(x, y+r);
	ctx.lineTo(x, y+h-r);
	ctx.quadraticCurveTo(x, y+h, x+r, y+h);
	ctx.lineTo(x+w, y+h);
	ctx.lineTo(x+w, y);
	ctx.lineTo(x+r, y);
	ctx.quadraticCurveTo(x, y, x, y+r);
	ctx.closePath();
	ctx.fill();
}

function drawTopRoundedRectangle(ctx,x,y,w,h,r) {
	var r = r / 2;
	ctx.beginPath();
	ctx.moveTo(x, y+r);
	ctx.lineTo(x, y+h);
	ctx.lineTo(x+w, y+h);
	ctx.lineTo(x+w, y+r);
	ctx.quadraticCurveTo(x+w, y, x+w-r, y);
	ctx.lineTo(x+r, y);
	ctx.quadraticCurveTo(x, y, x, y+r);
	ctx.closePath();
	ctx.fill();
}

function rotateVector(vectorX, vectorY, angle)
{
	var newX = vectorX * Math.cos(angle) - vectorY * Math.sin(angle);
	var newY = vectorY * Math.cos(angle) + vectorX * Math.sin(angle);
	return {
				x: newX,
				y: newY
			}
}

CachedText.prototype = {
	_value: "",
	_color: '#000000',
	_stroke: false,
	_strokeColor: '#000000',
	_strokeWidth: 3,
	_size: 16,
	_canvas: null,
	_ctx: null,
	_dirty: false,
	_scale: 1.0,
	_font: "px 'proxima-nova-1','proxima-nova-2', "+mainFont,
	_usingRoundedFrame: false,
	_hmargin: 0,
	_vmargin: -1,
	_margin: 6,
	_frameOpacity: 0.3,
	_shadowBlur: 0,
	_roundedFrameStyle: '#006666',
	_addTop: 0,
	_minWidth: 0,

	setAddTop: function(a){
		if(a == this._addTop) return;
		this._addTop = a;
		this._dirty = true;
	},

	setMinWidth: function(a){
		if(a == this._minWidth) return;
		this._minWidth = a;
		this._dirty = true;
	},

	setFont: function(v){
		if(this._font == v) return;
		this._font = v;
		this._dirty = true;
	},

	setSize: function(v){
		if(this._size == v) return;
		this._size = v;
		this._dirty = true;
	},

	setScale: function(v){
		if(this._scale == v) return;
		this._scale = v;
		this._dirty = true;
	},

	setColor: function(v){
		if(this._color == v) return;
		this._color = v;
		this._dirty = true;
	},

	setStroke: function(v){
		if(this._stroke == v) return;
		this._stroke = v;
		this._dirty = true;
	},

	setShadowBlur: function(v){
		if(this._shadowBlur == v) return;
		this._shadowBlur = v;
		this._dirty = true;
	},

	setStrokeWidth: function(v){
		if(this._strokeWidth == v) return;
		this._strokeWidth = v;
		this._dirty = true;
	},

	setStrokeColor: function(v){
		if(this._strokeColor == v) return;
		this._strokeColor = v;
		this._dirty = true;
	},

	setValue: function(str){
		if(str == this._value) return;
		this._value = str;
		this._dirty = true;
	},

	setHMargin: function(m){
		if(m == this._hmargin) return;
		this._hmargin = m;
		this._dirty = true;
	},

	setVMargin: function(m){
		if(m == this._vmargin) return;
		this._vmargin = m;
		this._dirty = true;
	},

	setMargin: function(m){
		if(m == this._margin) return;
		this._margin = m;
		this._dirty = true;
	},

	setUsingRoundedFrame: function(b){
		if(b == this._usingRoundedFrame) return;
		this._usingRoundedFrame = b;
		this._dirty = true;
	},

	setRoundedFrameOpacity: function(o){

		if(o == this._frameOpacity) return;
		this._frameOpacity = o;
		this._dirty = true;
	},

	setRoundedFrameStyle: function(b){
		if(b == this._roundedFrameStyle) return;
		this._roundedFrameStyle = b;
		this._dirty = true;
	},

	render: function(){
		if(this._canvas == null){
			this._canvas = document.createElement('canvas');
			this._ctx = this._canvas.getContext('2d');
		}

		if(this._dirty){
			this._dirty = false;
			var canvas = this._canvas;
			var ctx = this._ctx;
			var txt = this._value;
			var scale = this._scale;
			var h = this._size;
			var font = 'Bold ' + h + this._font;
			ctx.font = font;
			var w = ctx.measureText(txt).width;
			var measuredTextDelta = 0;
			if(w < this._minWidth){
				measuredTextDelta = this._minWidth - w;
				w = this._minWidth;
			}

			h -= h*0.1;
			w += 2;

			//var margin = this._hmargin;
			//var vmargin = 2;
			
			//if(this._vmargin > -1)
				//vmargin = this._vmargin;

			//var addedStrokeWidth = 0;
			//if(this._stroke)
			//	addedStrokeWidth = this._strokeWidth;

			var margin = this._margin;
			if(this._shadowBlur > margin)
				margin = this._shadowBlur;

			canvas.width = (w + margin*2.0) * scale;
			canvas.height = (h + margin*2.0 + this._addTop) * scale;

			// For Debug. See where canvas is
			//ctx.fillStyle="red";
			//ctx.fillRect(0, 0, canvas.width, canvas.height);

			ctx.font = font;
			ctx.textBaseline = 'middle';
			ctx.scale(scale, scale);
			ctx.globalAlpha = 1.0;
			
			if(this._usingRoundedFrame)
			{
				ctx.fillStyle = this._roundedFrameStyle;
				ctx.globalAlpha = this._frameOpacity;
				drawRoundedRectangle(ctx, 0, 0, canvas.width, canvas.height, 30);
				ctx.globalAlpha = 1.0;
			}

			var x = margin + measuredTextDelta/2.0;
			var y = margin + this._addTop + h/2.0;
			ctx.fillStyle = this._color;
			if(this._stroke){
				ctx.lineJoin = 'round';
				ctx.lineWidth = this._strokeWidth;
				ctx.strokeStyle = this._strokeColor;
				ctx.strokeText(txt, x, y);
			}

			if(this._shadowBlur > 0)
			{
				ctx.shadowBlur = this._shadowBlur;
				ctx.shadowColor = this._strokeColor;
			}
			ctx.fillText(txt, x, y);
		}

		return this._canvas;
	}
}

Cached3DText.prototype = {
	_value: "",
	_color: '#000000',
	_secondColor: '#FFFFFF',
	_size: 16,
	_canvas: null,
	_ctx: null,
	_dirty: false,
	_scale: 1.0,
	_font: "px 'proxima-nova-1','proxima-nova-2', "+mainFont,
	_extrude: 3,
	_usingFrame: false,
	_usingRoundedFrame: false,
	_angX: 0,
	_angY: 0,
	_d: 5,
	_addTop: 0,

	setAddTop: function(a){
		if(a == this._addTop) return;
		this._addTop = a;
		this._dirty = true;
	},

	setFont: function(v){
		if(this._font == v) return;
		this._font = v;
		this._dirty = true;
	},

	setSize: function(v){
		if(this._size == v) return;
		this._size = v;
		this._dirty = true;
	},

	setScale: function(v){
		if(this._scale == v) return;
		this._scale = v;
		this._dirty = true;
	},

	setColor: function(v){
		if(this._color == v) return;
		this._color = v;
		this._dirty = true;
	},

	setSecondColor: function(v){
		if(this._secondColor == v) return;
		this._secondColor = v;
		this._dirty = true;
	},

	setValue: function(str){
		if(str == this._value) return;
		this._value = str;
		this._dirty = true;
	},

	setUsingRoundedFrame: function(b){
		if(b == this.__usingRoundedFrame) return;
		this._usingRoundedFrame = b;
		this._dirty = true;
	},

	setUsingFrame: function(b){
		if(b == this._usingFrame) return;
		this._usingFrame = b;
		this._dirty = true;
	},

	calcAngVector: function(angle){
		var angX, angY;
		this._angX = Math.sin(angle)*this._d;
		this._angY = Math.cos(angle)*this._d;
	},

	render: function(){
		if(this._canvas == null){
			this._canvas = document.createElement('canvas');
			this._ctx = this._canvas.getContext('2d');
		}

		if(this._dirty){
			this._dirty = false;
			var canvas = this._canvas;
			var ctx = this._ctx;
			var txt = this._value;
			var scale = this._scale;
			var h = this._size;
			var font = 'Bold ' + h + this._font;

			var frameMargin = 10;

			ctx.font = font;
			var w = ctx.measureText(txt).width;
			var margin = 3;
			var vmargin = ~~(h * 0.2)

			canvas.width = (w + margin * 2 + frameMargin + this._d*2) * scale;
			canvas.height = (h + vmargin + this._extrude + this._d*2 + this._addTop) * scale;

			ctx.font = font;
			ctx.scale(scale, scale);

			// Draw frame if needed
			if(this._usingFrame)
			{
				ctx.globalAlpha = 1.0;
				ctx.fillStyle = '#000000';
				ctx.moveTo(this._angX, this._angY + 15*zoomAdjust);
				ctx.lineTo(canvas.width + this._angX - 4*zoomAdjust, this._angY + 7*zoomAdjust);
				ctx.lineTo(canvas.width + this._angX - 15*zoomAdjust, canvas.height + this._angY - 9*zoomAdjust);
				ctx.lineTo(this._angX + 5*zoomAdjust, canvas.height + this._angY - 17*zoomAdjust);
				ctx.fill();
			}

			if(this._usingRoundedFrame)
			{
				ctx.globalAlpha = 0.4;
				drawRoundedRectangle(ctx, 0, 0, canvas.width, canvas.height, 40);
				ctx.globalAlpha = 1.0;
			}

			for(var i = this._extrude; i >= 0; i--){
				var vShift = i;
				if(i == 0)
					ctx.fillStyle = this._color;
				else
					ctx.fillStyle = this._secondColor;
				ctx.fillText(txt, margin + frameMargin/2.0 + this._d, h - vmargin / 2 + vShift + this._d + this._addTop);
			}
		}

		return this._canvas;
	}
}