var Hud = function() {

	var lastZoomAdjust;

	// Message
	var displayMessage;
	var displayMessageName;
	var displayTime = 0;
	var messageType;

	// 3D Text Messages
	var spectatorModeText;
	var displayText;
	var displayTextName;

	// Special Messages
	var display2Text;
	var display2Message;
	var display2Time = 0;
	var display2Size = 0;

	// Score
	var lastScoreValue = -1;
	var scoreText, scoreTextContext;
	var renderedScore;
	var renderedScoreWidth;

	// Ammo
	var ammoText;
	var renderedAmmo;
	var renderedAmmoWidth;
	var lastAmmoValue = -1;

	// Leaderboard
	var updateLeaderboard = false;
	var leaderboardList;
	var renderedLeaderboard;
	var leaderboardWidth;
	var leaderboardWidthScaled;
	var leaderboardHeight;
	var leaderboardMargin = 5;
	var lastLocalPlayerRank = -1;

	// Weapons
	var currentWeapon, weaponToSwitch;
	var weaponIconScale = 1.0;
	var weaponIconPhase = 0;

	// King
	var kingName;
	var kingCachedText;
	var renderedCachedText;
	var prevKingID = 0;

	// Bottom Tip Message
	var bottomTipMessage;
	var bottomTipText;
	var bottomTipTextRender;
	var bottomTipMessageTime = 0;
	var bottomTipMessageIsTimed = true;
	var bottomTipMessageDuration = 4000.0;
	var bottomTipFadeTime = 300;
	var bottomTipCurrentFadeTime = bottomTipFadeTime;
	var bottomTipShowing = false;
	var bottomTipMessageColor1 = null;
	var bottomTipMessageColor2 = null;

	// Laser
	var renderedCachedLaserText;
	var laserCachedText;
	var assignedLaserPlayerName = -1;

	// Rank
	var lastRankPos;
	var rankCachedText;
	var renderedCachedRankText;

	// My Rank
	var myRank = 0;
	var myScore = 0;

	// Draw Killstreak and Length
	var prevKillStreak = 0;
	var prevLength = 0;
	var cachedPositionText;
	var cachedKillStreakText;
	var cachedLengthText;
	var renderedPositionText;
	var renderedKillStreakText;
	var renderedLengthText;
	var cachedTalkText;
	var renderedTalkText;
	var talkBlink = 0.0;
	var prev_talkStamina = 0;

	// Talk Layer
	var talkLayer;

	this.draw = function(context) {

		// Display Message
		if(displayTime > 0)
		{
			var opacity = 0.0;
			var delta = (+new Date() - displayTime);
			if(delta < 4000){
				if(delta < 3000){
					opacity = 1.0;
				}else{
					opacity = 1.0 - (delta - 3000)/1000;
				}
			}else{
				displayTime = 0;
			}

			var hasName = false;
			if(!displayText){
				var size = 22;
				if(displayMessageName){
					var fontSize = 36;
					displayTextName = new CachedText(fontSize*zoomAdjust, '#00FFFF', false, '#00AAAA');
					displayTextName.setValue(displayMessageName);
					displayTextName.setUsingRoundedFrame(true);
					hasName = true;
					displayTextName.setAddTop(35);
					displayTextName.setShadowBlur(4);
				}else{
					displayTextName = null;
					size = 35;
				}
				displayText = new CachedText(size*zoomAdjust, '#00FFFF', false, '#00AAAA');
				displayText.setValue(displayMessage);
				displayText.setUsingRoundedFrame(!hasName);
				displayText.setShadowBlur(3);
				if(!displayMessageName)
					displayText.setAddTop(-2);
			}

			var yPos = canvas.height*0.21;
			if(messageType == HUD_BOTTOM){
				yPos = canvas.height*0.55;
				var red = '#f90600';
				displayText.setColor(red);
				displayText.setStrokeColor(red);
				displayText.setRoundedFrameStyle(red);
				if(displayTextName)
				{
					displayTextName.setColor(red);
					displayTextName.setStrokeColor(red);
					displayTextName.setRoundedFrameStyle('#FF9999');
					displayTextName.setRoundedFrameOpacity(0.1);
				}
			}

			var render = displayText.render();
			if(hasName)
				displayTextName.setMinWidth(render.width);

			var render2;
			if(displayMessageName)
				render2 = displayTextName.render();

			context.globalAlpha = opacity;

			context.save();
			context.scale(zoomAdjust, zoomAdjust);
			if(render2)
				context.drawImage(render2, (canvas.width*0.5)/zoomAdjust - render2.width/2.0, (yPos - 5)/zoomAdjust);
			context.drawImage(render, (canvas.width*0.5)/zoomAdjust - render.width/2.0, yPos/zoomAdjust);
			context.restore();

			context.globalAlpha = 1.0;
		}

		// Special Message
		if(display2Time > 0)
		{
			var opacity = 0.0;
			var delta = (+new Date() - display2Time);
			if(delta < 4000){
				if(delta < 3000){
					opacity = delta/200.0;
					if(opacity > 1.0)
						opacity = 1.0;
				}else{
					opacity = 1.0 - (delta - 3000)/1000;
				}
			}else{
				display2Time = 0;
			}

			var hasName = false;
			if(!display2Text){
				var size = display2Size;
				display2Text = new CachedText(size*zoomAdjust, '#00FFFF', false, '#00AAAA');
				display2Text.setValue(display2Message);
				display2Text.setUsingRoundedFrame(!hasName);
				display2Text.setShadowBlur(3);
				display2Text.setAddTop(-2);
			}

			var yPos = canvas.height*0.70;
			var yellow = '#00FFFF';
			display2Text.setColor(yellow);
			display2Text.setStrokeColor(yellow);
			display2Text.setRoundedFrameStyle(yellow);
			display2Text.setRoundedFrameOpacity(0.11);

			var render = display2Text.render();
			context.globalAlpha = opacity;

			/*
			context.save();
			context.translate(canvas.width*0.5, yPos - 30*zoomAdjust);
			context.scale(1.2*zoomAdjust, 1.2*zoomAdjust);
			resources.frames.trophy.draw(context);
			context.restore();
			*/

			context.save();
			context.scale(zoomAdjust, zoomAdjust);
			context.drawImage(render, (canvas.width*0.5)/zoomAdjust - render.width/2.0, yPos/zoomAdjust);
			context.restore();
			context.globalAlpha = 1.0;
		}

		// Testing kill counter
		if(isInGame && localPlayer)
		{
			var margin = 5;
			if (localPlayer.x) {
				cachedPositionText = new CachedText(15*zoomAdjust, '#00FFFF', false, '#00AAAA');
				cachedPositionText.setValue('POS: ' + Math.floor(localPlayer.x) + ', ' + Math.floor(localPlayer.y));
				renderedPositionText = cachedPositionText.render();

				
			}
			if(!cachedKillStreakText || prevKillStreak != killStreak)
			{
				cachedKillStreakText = new CachedText(15*zoomAdjust, '#00FFFF', false, '#00AAAA');
				cachedKillStreakText.setValue('KILLS: ' + killStreak);
				renderedKillStreakText = cachedKillStreakText.render();
				prevKillStreak = killStreak;
				statKillStreak = killStreak;
			}

			if(!cachedLengthText || prevLength != myScore)
			{
				cachedLengthText = new CachedText(15*zoomAdjust, '#00FFFF', false, '#00AAAA');
				cachedLengthText.setValue('SCORE: ' + myScore);
				renderedLengthText = cachedLengthText.render();
				prevLength = myScore;
			}

			if(!cachedTalkText)
			{
				cachedTalkText = new CachedText(15*zoomAdjust, '#00FFFF', false, '#00AAAA');
				cachedTalkText.setValue('TALK');
				renderedTalkText = cachedTalkText.render();
			}

			context.save();
			context.scale(zoomAdjust, zoomAdjust);

			if(talkEnabled > 0.0)
			{
				var fill = localPlayer.talkStamina/255;
				if(localPlayer.talkStamina == 255 && prev_talkStamina < 255)
				{
					if(!window.localStorage.talk)
						window.localStorage.talk = 1;
					else
						window.localStorage.talk++;

					if(window.localStorage.talk <= 7 && window.localStorage.talk%2==0)
						hud.showTip('Press T to talk', 4000);
				}
				prev_talkStamina = localPlayer.talkStamina;

				if(fill == 1.0)
					context.globalAlpha = 0.3;
				else
					context.globalAlpha = 0.1 + talkBlink*0.6;

				var talkY = canvas.height/zoomAdjust - renderedKillStreakText.height - renderedLengthText.height - renderedTalkText.height - margin;
				context.drawImage(renderedTalkText, margin, talkY);
			}
			context.globalAlpha = 0.3;

			context.drawImage(renderedPositionText, margin, canvas.height/zoomAdjust - renderedKillStreakText.height - renderedLengthText.height - renderedTalkText.height - renderedPositionText.height - margin);
			context.drawImage(renderedKillStreakText, margin, canvas.height/zoomAdjust - renderedKillStreakText.height - renderedLengthText.height - margin);
			context.drawImage(renderedLengthText, margin, canvas.height/zoomAdjust - renderedKillStreakText.height - margin);

			if(talkEnabled > 0.0)
			{
				var radius = 4;
				var talkWaitX = renderedTalkText.width + margin + radius*2
				var talkWaitY = talkY + 13;
				this.drawTalkWaitFx(context, talkWaitX, talkWaitY, radius, fill);
			}
			context.globalAlpha = 1.0;
			context.restore();
		}

		// Leaderboard
		if(updateLeaderboard){
			renderedLeaderboard = document.createElement('canvas');
			var contextScore = renderedLeaderboard.getContext('2d');
			this.renderLeaderboard(contextScore, renderedLeaderboard);
			updateLeaderboard = false;
		}

		if(renderedLeaderboard && isInGame)
		{
			this.drawLeaderboard(context);
		}

		// Bottom Tip
		if(bottomTipMessage)
		{
			if((bottomTipMessageTime > 0 && bottomTipMessageIsTimed || !bottomTipMessageIsTimed) || bottomTipCurrentFadeTime > 0)
			{
				if(bottomTipTextRender == null)
				{
					var fontSize = parseInt(20*zoomAdjust)+1;
					bottomTipText = new CachedText(fontSize, bottomTipMessageColor1, false, bottomTipMessageColor1);
					bottomTipText.setValue(bottomTipMessage);
					bottomTipText.setUsingRoundedFrame(true);
					bottomTipText.setRoundedFrameStyle(bottomTipMessageColor2);
					bottomTipText.setShadowBlur(2);
					bottomTipTextRender = bottomTipText.render();
				}

				var yAdjustPerc;
				if(bottomTipShowing){
					yAdjustPerc = 1.0 - bottomTipCurrentFadeTime / bottomTipFadeTime;
				}else{
					yAdjustPerc = bottomTipCurrentFadeTime / bottomTipFadeTime;
				}

				context.drawImage(bottomTipTextRender, screenWidth/2 - bottomTipTextRender.width/2, bottomTipTextRender.height*1.1*yAdjustPerc - bottomTipTextRender.height);
			}
		}

		if(!UIVisible && talkEnabled > 0.0)
			talkLayer.draw(context);

		// Force text to be recreated after resizing
		if(lastZoomAdjust != zoomAdjust){
			spectatorModeText = null;
			lastZoomAdjust = zoomAdjust;
		}
	};

	this.drawTalkWaitFx = function(context, x, y, radius, fill) {
		var rotate = -Math.PI/2.0;
		var startAngle = rotate;
		var endAngle = 2.0 * Math.PI * fill + rotate;

		context.beginPath();

		context.lineWidth = radius*2;
		context.arc(x, y, radius, 0, 2*Math.PI, false);
		context.strokeStyle = '#00FFFF';
		context.globalAlpha = 0.1;
		context.stroke();

		context.beginPath();
		context.arc(x, y, radius, startAngle, endAngle, false);

		// line color
		context.globalAlpha = 0.6;
		context.stroke();
	}

	this.update = function(dt) {
		// Ease In, Ease out
		if(bottomTipCurrentFadeTime > 0.0){
			bottomTipCurrentFadeTime -= dt;
			if(bottomTipCurrentFadeTime	<= 0.0 && !bottomTipShowing)
			{
				bottomTipMessage = null;
			}
		}else
			bottomTipCurrentFadeTime = 0.0;

		if(bottomTipMessageIsTimed)
			bottomTipMessageTime -= dt;

		if(bottomTipMessageIsTimed && bottomTipCurrentFadeTime <= 0.0 && bottomTipShowing && bottomTipMessageTime <= 0.0)
		{
			bottomTipShowing = false;
			bottomTipCurrentFadeTime = bottomTipFadeTime;
		}

		if(talkBlink > 0.0){
			talkBlink -= dt/500;
			if(talkBlink < 0.0)
				talkBlink = 0.0
		}
	};

	this.renderLeaderboard = function(context, renderElement) {
		leaderboardWidth = 230;
		leaderboardHeight = 0;

		var insideMargin = 5*zoomAdjust;
		var entryMargin = 10*zoomAdjust;
		var titleSize = 23*zoomAdjust;
		var entrySize = 18*zoomAdjust;
		var entryPositionY;
		var minStretchWidth = 0*zoomAdjust;
		var marginBetweenTitleAndEntries = 5*zoomAdjust;
		var titleHeight = 32;
		var fontType = 'Arial Black';
		var outerMargin = 6;

		leaderboardHeight += insideMargin + titleSize + insideMargin + outerMargin*2;
		entryPositionY = outerMargin + insideMargin + titleSize + insideMargin;
		var leaderboardCount = leaderboardList.length;
		var maxWidth = 0;

		function updateSizes(nick) {
			leaderboardHeight += entrySize + entryMargin;
			var entryWidth = context.measureText(getPlayerName(nick)).width;
			if(maxWidth < entryWidth)
			{
				maxWidth = entryWidth;
			}
    	}

		var onTop = false;
		var myEntry;
		for(var i = 0; i < leaderboardCount; i++)
		{
			var entry = leaderboardList[i];
			if(entry){
				if(localPlayerID == entry.id && !onTop){
					onTop = true;
				}
				updateSizes(entry.nick.substring(0, 16));
			}
		}

		if(!onTop && localPlayer)
		{
			updateSizes(localPlayer.nick);
		}

		if(maxWidth > minStretchWidth)
		{
			leaderboardWidth += (maxWidth - minStretchWidth);
		}

		leaderboardWidthScaled = leaderboardWidth*zoomAdjust;

		renderElement.width = leaderboardWidthScaled;
		renderElement.height = leaderboardHeight;

		context.fillStyle = '#003a3a';
		var rectMargin = outerMargin; //2;

		// Whole panel
		context.globalAlpha = 0.3;
		drawRoundedRectangle(context, rectMargin, rectMargin, leaderboardWidthScaled - rectMargin*2, leaderboardHeight - rectMargin*2, 15*zoomAdjust);
		context.globalAlpha = 1.0;

		// Draw Stroke ?
		//context.strokeStyle = 'rgba(0,255,255,1.0)';
		//context.lineWidth = 2.0;
		//context.stroke();

		// Top
		var topPartColor = '#337777';//'rgba(0,255,255,1.0)';
		context.shadowColor = topPartColor;
		context.shadowBlur = outerMargin;
		context.fillStyle = topPartColor;
		context.globalAlpha = 0.5;
		drawTopRoundedRectangle(context, rectMargin, rectMargin, leaderboardWidthScaled - rectMargin*2, titleHeight*zoomAdjust, 15*zoomAdjust);
		context.globalAlpha = 1.0;

		// Draw "Leaderboard"
		var leaderboardText = 'LEADERBOARD';
		var topTextColor = '#09ffff';//'rgba(0,100,100,1.0)';
		context.font = titleSize + "px 'proxima-nova-1','proxima-nova-2', "+fontType;
		context.textBaseline = 'middle';
		var textWidth = context.measureText(leaderboardText).width;
		context.fillStyle = topTextColor;
		context.shadowColor = topTextColor;
		context.shadowBlur = 6;
		context.fillText(leaderboardText, leaderboardWidthScaled/2 - textWidth/2, insideMargin + outerMargin + titleSize/2.0);
		context.shadowBlur = 2;

		var myStyle = '#09ffff';
		var playerStyle = 'rgba(0,255,255,0.4)';
		var playerFont = entrySize + "px 'proxima-nova-1','proxima-nova-2', "+fontType;
		// Draw Leaderboard Content
		context.font = playerFont;
		entryPositionY += marginBetweenTitleAndEntries;

		var dotSpace = '. ';
		for(var i = 0; i < leaderboardCount; i++)
		{
			var entry = leaderboardList[i];
			if(entry){

				var isKing = (i==0)&&(kingID>0);
				var kingOffsetX;
				var entryText = (i+1) + dotSpace;
				if(isKing){
					kingOffsetX = context.measureText(entryText).width;
					entryText += "    "; // Give space for the crown
				}
				entryText += getPlayerName(entry.nick);
				var vShift = 0;

				// Color
				if(localPlayerID == entry.id){
					context.fillStyle = myStyle;
				}else{
					context.fillStyle = playerStyle;
				}

				context.font = playerFont;
				var textWidth = context.measureText(entryText).width;
				context.fillText(entryText, outerMargin + insideMargin, entryPositionY + vShift + entrySize/2.0);
				var scoreWidth = context.measureText(entry.score).width;
				context.fillText(entry.score, leaderboardWidthScaled - insideMargin - scoreWidth - outerMargin, entryPositionY + vShift + entrySize/2.0);
				
				if(isKing){
					context.save();
					context.translate(outerMargin + insideMargin + kingOffsetX + 10, entryPositionY + vShift + entrySize/2.0 - 1);
					var s = 1.0;
					if(!highQuality)
						s = 0.5;
					context.scale(0.8*s, 0.8*s);
					resources.frames.crown.draw(context);
					context.restore();
				}

				entryPositionY += entrySize + entryMargin;
			}
		}

		// Add me as last entry
		if(!onTop && localPlayer)
		{
			context.fillStyle = myStyle;
			var entryText = myRank + dotSpace + getPlayerName(localPlayer.nick);

			var textWidth = context.measureText(entryText).width;
			context.fillText(entryText, outerMargin + insideMargin, entryPositionY + vShift + entrySize/2.0);
			var scoreWidth = context.measureText(myScore).width;
			context.fillText(myScore, leaderboardWidthScaled - insideMargin - scoreWidth - outerMargin, entryPositionY + vShift + entrySize/2.0);
		}
	}

	this.drawLeaderboard = function(context) {
		context.drawImage(renderedLeaderboard, screenWidth - leaderboardWidthScaled - leaderboardMargin, leaderboardMargin);
	};

	this.addMessage = function(msg, _messageType, name) {
		displayMessage = msg;
		displayText = null;
		displayMessageName = name;
		displayTime = +new Date();
		messageType = _messageType;
	};

	this.addSpecialMessage = function(msg, size) {
		display2Message = msg;
		display2Text = null;
		display2Time = +new Date();
		display2Size = size;
	};

	this.refreshLeaderboard = function(list) {
		leaderboardList = list;
		updateLeaderboard = true;
	};

	this.showTip = function(tipMessage, time, color1, color2) { // time 0 to infinite
		if(bottomTipMessage)
			this.clearTip();
		bottomTipMessage = tipMessage;
		bottomTipMessageTime = time;
		bottomTipMessageIsTimed = (time > 0.0);
		bottomTipTextRender = null;
		bottomTipCurrentFadeTime = bottomTipFadeTime;
		bottomTipShowing = true;

		if(color1)
		{
			bottomTipMessageColor1 = color1;
			bottomTipMessageColor2 = color2;
		}else{
			// Default color
			bottomTipMessageColor1 = '#00FFFF';
			bottomTipMessageColor2 = '#006666';
		}
	};

	this.clearTip = function() {
		bottomTipShowing = false;
		bottomTipCurrentFadeTime = bottomTipFadeTime;
	};

	this.updateRank = function(rank, score) {
		myRank = rank;
		myScore = score;
	};

	this.cantTalk = function() {
		talkBlink = 1.0;
	};

	this.toggleTalkLayer = function() {
		/*if(localPlayer.talkStamina < 255)
		{
			this.cantTalk();
		}else{*/
			if(talkLayer.visible)
			{
				talkLayer.visible = false;
			}else{
				talkLayer.visible = true;
			}
		//}
	};

	this.hideTalkLayer = function() {
		talkLayer.visible = false;
	};
	
	this.fastHideTalkLayer = function() {
		talkLayer.fastHide();
	};

	// Constructor
	(function(){
		talkLayer = new TalkLayer();
	})();
}
