var TalkLayer = function() {
	var talkLayer = this;

	var startX = 10;
	var startY = 100;
	var marginX = 10;
	var labelWidth = 180;
	var renderedElement;
	this.visible = false;
	var hiddenOffsetX = -labelWidth - marginX;
	var hideValue = 1;

	this.fastHide = function() {
		hideValue = 1;
		this.visible = false;
	};

	this.draw = function(context) {
		if(this.visible)
		{
			hideValue += (0.0 - hideValue)/10.0;
		}else{
			hideValue += (1.0 - hideValue)/10.0;
		}
		if(hideValue > 0.99)
			return;
		context.translate(startX + hiddenOffsetX*hideValue, startY);
		context.scale(zoomAdjust, zoomAdjust);

		context.font = 'Bold ' + 15 + "px 'proxima-nova-1','proxima-nova-2', Arial";
		context.fillStyle = 'rgba(0, 255, 255, 1.0)';
		context.shadowBlur = 5;
		context.shadowColor = 'rgba(0, 200, 200, 1.0)';
		var baseY = 15;
		if(localPlayer)
		{
			if(localPlayer.talkStamina < 255){
				context.fillText("CANT TALK YET", 20, baseY);
				var fill = localPlayer.talkStamina/255;
				hud.drawTalkWaitFx(context, 20+140, 8, 4, fill);
				context.globalAlpha = 0.5;
			}else{
				context.fillText("PRESS A NUMBER", 20, baseY);
			}
		}
		context.shadowBlur = 0;
		context.drawImage(renderedElement, 0, 0);
		context.globalAlpha = 1.0;
	}

	this.preRender = function(contextLayer, renderedElement) {
		// Lets Pre-Render
		renderedElement.width = labelWidth;
		renderedElement.height = 10*31+23;

		contextLayer.font = 'Bold ' + 15 + "px 'proxima-nova-1','proxima-nova-2', Arial";
		contextLayer.fillStyle = 'rgba(0, 255, 255, 1.0)';
		contextLayer.shadowBlur = 5;
		contextLayer.shadowColor = 'rgba(0, 200, 200, 1.0)';

		var baseY = 15;
		baseY+=8;
		for(var i = 0; i < 10; i++)
		{
			contextLayer.globalAlpha = 0.3;
			contextLayer.fillStyle = '#004444';

			contextLayer.shadowBlur = 0;
			drawRoundedRectangle(contextLayer, 0, baseY+i*31, labelWidth, 30, 30);

			contextLayer.globalAlpha = 1.0;
			drawLeftRoundedRectangle(contextLayer, 0, baseY+i*31, 35, 30, 30);
		

			contextLayer.globalAlpha = 1.0;
			contextLayer.fillStyle = 'rgba(0, 255, 255, 1.0)';
			contextLayer.shadowBlur = 5;
			contextLayer.shadowColor = 'rgba(0, 200, 200, 1.0)';

			var offX = 5;
			var index = (i+1);
			if(index == 10)
				index = 0;
			contextLayer.fillText(index, marginX+offX, baseY+i*31 + 5 + 15);

			var text = talkTexts[i];
			var width = contextLayer.measureText(text).width;
			if (window.localStorage[`chatOverride${index}`]) {
				text = window.localStorage[`chatOverride${index}`];
			}
			contextLayer.fillText(text, 35 + (labelWidth-35)/2.0 - width/2.0, baseY+i*31 + 5 + 15);
		}
		contextLayer.globalAlpha = 1.0;
		contextLayer.shadowBlur = 0;
	};

	// Constructor
	(function(){
		renderedElement = document.createElement('canvas');
		var ctx = renderedElement.getContext('2d');
		talkLayer.preRender(ctx, renderedElement);
	})();
}
