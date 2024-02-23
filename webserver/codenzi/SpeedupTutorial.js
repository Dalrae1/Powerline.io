var SpeedupTutorial = function() {
	var speedupTutorial = this;
	var snake1, snake2;
	var updateTime = 0;
	var snake1X = 0;
	var snake1Y = 0;
	var snake2X = 8;
	var snake2Y = -4;
	var minSpeed = 0.5;
	var snake2State = 0;
	var snake2PointCount = 2;
	var snake2ExtraSpeed = 0;
	var snake2Speed = minSpeed;
	var blockX = 0;
	var snake2Length = 15;
	var foodArray = [];
	var entityCounterID = 99999;
	var snake1ID, snake2ID;
	var snake1Hue = 320;
	var snake2Hue = 170;
	var alpha = 0.0;
	var maxFood = 20;
	var fadeOutNow = false;
	var waitToFadeout = false;
	var dropFood = false;
	var fadeOutWaitTime = 0;
	this.isInitialized = false;

	speedupTutorial.buildFoodPacket = function(netInfo) {
		var buffer = new ArrayBuffer(100);
		var view = new DataView(buffer);
		var offset = 0;

		// X
		view.setFloat32(offset, netInfo.x, true);
		offset += 4;
		
		// Y
		view.setFloat32(offset, netInfo.y, true);
		offset += 4;

		// Full
		if(netInfo.isFull)
		{
			view.setUint16(offset, netInfo.hue, true);
			offset += 2;
		}

		return view;
	}

	speedupTutorial.buildSnakePacket = function(netInfo) {
		var buffer = new ArrayBuffer(100);
		var view = new DataView(buffer);
		var offset = 0;

		// X
		view.setFloat32(offset, netInfo.x, true);
		offset += 4;
		
		// Y
		view.setFloat32(offset, netInfo.y, true);
		offset += 4;

		// lastLen
		view.setFloat32(offset, netInfo.lastLen, true);
		offset += 4;

		// curLengthDst
		view.setFloat32(offset, netInfo.curLengthDst, true);
		offset += 4;

		// Skip direction
		offset += 1;		

		// Point Count
		var pointCount = netInfo.pointCount;
		view.setUint16(offset, pointCount, true);
		offset += 2;

		// Flags // ...
		view.setUint8(offset, netInfo.flags, true);
		offset += 1;

		// flags stuff if needed
		if(netInfo.flags & 0x2) // Rubbing
		{
			view.setFloat32(offset, netInfo.rubPoint.x, true);
			offset += 4;
			view.setFloat32(offset, netInfo.rubPoint.y, true);
			offset += 4;

			view.setUint16(offset, 1, true);
			offset += 2;
		}

		view.setUint8(offset, 0, true);
		offset += 1;

		// Extra Speed
		view.setUint8(offset, netInfo.extraSpeed, true);
		offset += 1;

		// Full
		if(netInfo.isFull)
		{
			// Points
			for(var i = 0; i < pointCount; i++)
			{
				view.setFloat32(offset, netInfo.points[i].x, true);
				offset += 4;
				view.setFloat32(offset, netInfo.points[i].y, true);
				offset += 4;
			}

			view.setUint16(offset, netInfo.hue, true);
			offset += 2;

			view.setUint8(offset, 0, true);
			offset += 1;
		}else{
			// New Points?
			var newPointCount = netInfo.newPointCount;
			view.setUint8(offset, newPointCount, true);
			offset += 1;

			// Points
			for(var i = 0; i < newPointCount; i++)
			{
				view.setFloat32(offset, netInfo.newPoints[i].x, true);
				offset += 4;
				view.setFloat32(offset, netInfo.newPoints[i].y, true);
				offset += 4;
			}
		}
		return view;
	}

	speedupTutorial.update = function(dt) {
		if(!this.isInitialized)
			return;

		if(dt > 100)
			return;

		if(waitToFadeout)
		{
			fadeOutWaitTime += dt;
			if(fadeOutWaitTime > 1000)
			{
				fadeOutWaitTime = 0;
				fadeOutNow = true;
				waitToFadeout = false;
			}
		}

		if(snake2State == 7 && fadeOutNow)
		{			
			alpha -= 0.04;
			if(alpha < 0.0){
				alpha = 0.0;

				// Reset
				speedupTutorial.clear();
				speedupTutorial.init();
				showTip(0);
			}
		}else{
			alpha += 0.04;
			if(alpha > 1.0)
				alpha = 1.0;
		}

		snake1.setAlpha(alpha);
		snake2.setAlpha(alpha);

		var interpTime = INTERP_TIME; 
		if(updateTime > interpTime)
		{
			// Update Snake1
			if(entities[snake1.id] != undefined)
			{
				if(snake2State >= 4 && snake1X > blockX)
				{
					if(!dropFood)
					{
						dropFood = true;
						// First snake should die
						snake1.killReason = KILL_REASON_SUICIDE;
						snake1.beingDeleted = true;
						snake1.setDead();

						for(var i = 0; i < maxFood; i++)
						{
							var x = (blockX - 30) + i*(30/maxFood);
							var y = 0;
							var speedX = (Math.random() + 0.5)*0.5;
							var speedY = (Math.random() - 0.5)*0.3;
							//x += speedX;
							//y += speedY;

							var food = this.initFood(x, y, snake1Hue - 25 +Math.random()*50);
							food.speedX = speedX;
							food.speedY = speedY;
						}
					}
				}else{
					snake1X += minSpeed;
					var netInfo = {};
					netInfo.x = snake1X;
					netInfo.y = snake1Y;
					netInfo.lastLen = 2;
					netInfo.curLengthDst = 30;
					netInfo.pointCount = 2;
					netInfo.flags = 0;
					netInfo.extraSpeed = 0;
					netInfo.isFull = false;
					netInfo.newPointCount = 0;
					var packet = this.buildSnakePacket(netInfo);
					snake1.updateNetwork(packet, 0, false);
				}
			}

			// Update Snake2
			var netInfo = {};
			netInfo.newPointCount = 0;

			if(snake2State == 0)
			{
				if(snake2Y > -2.6){
					// First Turn
					snake2State = 1;
					snake2PointCount++;

					netInfo.newPointCount = 1;
					netInfo.newPoints = [];
					netInfo.newPoints.push({x: snake2X, y: snake2Y});
				}else{
					snake2Y += minSpeed;
				}
			}

			var speedUp = false;
			var rubbing = false;
			if(snake2State == 1 || snake2State == 3)
			{
				snake2X += snake2Speed;
				if((snake2X < snake1X-10 && snake2State == 1) || (snake2X < snake1X && snake2State == 3))
				{
					snake2Speed += 0.03;
					speedUp = true;
					if(snake2Speed > 5)
						snake2Speed = 5;

					snake2ExtraSpeed += 3;
					if(snake2ExtraSpeed > 200)
						snake2ExtraSpeed = 200;

					netInfo.flags |= 0x2;
					netInfo.rubPoint = {x: snake2X-0.06, y: snake1Y};
					rubbing = true;
				}else if((snake2X >= snake1X-10 && snake2State == 1) || (snake2X >= snake1X+4)){
					snake2X -= snake2Speed;

					if(snake2State == 1)
						// Turn to get closer
						snake2State = 2;
					else{
						// Turn to cross enemy and kill him
						snake2State = 4;
						blockX = snake2X;
					}

					snake2PointCount++;

					netInfo.newPointCount = 1;
					netInfo.newPoints = [];
					netInfo.newPoints.push({x: snake2X, y: snake2Y});
				}
			}
			if(!speedUp)
			{
				snake2Speed -= 0.01;
				if(snake2Speed < minSpeed)
					snake2Speed = minSpeed;
				snake2ExtraSpeed -= 1;
				if(snake2ExtraSpeed < 0)
					snake2ExtraSpeed = 0;

			}

			if(snake2State == 2 || snake2State == 4)
			{
				if(snake2State == 2)
				{
					if(snake2Y > -1.2){
						snake2State = 3;
						snake2PointCount++;

						netInfo.newPointCount = 1;
						netInfo.newPoints = [];
						netInfo.newPoints.push({x: snake2X, y: snake2Y});
						showTip(1);
						// Turn to be paralel and boost
					}else{
						snake2Y += snake2Speed;
					}
				}else{
					if(snake2Y > 0.8){
						// Turn to run away after crossing enemy
						snake2State = 5;
						snake2PointCount++;

						netInfo.newPointCount = 1;
						netInfo.newPoints = [];
						netInfo.newPoints.push({x: snake2X, y: snake2Y});
					}else{
						snake2Y += snake2Speed;
					}
				}

			}

			if(snake2State == 5)
			{
				if(snake2X > snake1X + 12)
				{
					snake2State = 6;
					snake2PointCount++;

					netInfo.newPointCount = 1;
					netInfo.newPoints = [];
					netInfo.newPoints.push({x: snake2X, y: snake2Y});
				}else{
					snake2X += snake2Speed;
				}
			}

			if(snake2State == 6)
			{
				if(snake2Y < 1.0)
				{
					snake2State = 7;
					snake2PointCount++;

					netInfo.newPointCount = 1;
					netInfo.newPoints = [];
					netInfo.newPoints.push({x: snake2X, y: snake2Y});
					showTip(2);
				}else{
					snake2Y -= snake2Speed;
				}
			}

			if(snake2State == 7)
			{
				snake2X -= snake2Speed;

				var foodCount = foodArray.length;
				for(var i = 0; i < foodCount; i++)
				{
					var food = foodArray[i];
					if(snake2.x < food.x + 30)
					{
						if(entities[food.id] != undefined && !food.beingDeleted){
							food.beingDeleted = true;
							food.beginGrabX = food.x;
							food.beginGrabY = food.y;
							food.setKilledBy(snake2.id);
							snake2Length += 1.1;
						}
					}
				}
			}

			netInfo.x = snake2X;
			netInfo.y = snake2Y;
			netInfo.lastLen = 2;
			netInfo.curLengthDst = snake2Length;
			netInfo.pointCount = snake2PointCount;
			netInfo.isFull = false;
			netInfo.extraSpeed = snake2ExtraSpeed;
			var packet = this.buildSnakePacket(netInfo);
			snake2.updateNetwork(packet, 0, false);
			if(rubbing)
			{
				snake2.setRubSnakeID(snake1ID);
			}

			// Update Food
			var foodCount = foodArray.length;
			for(var i = 0; i < foodCount; i++)
			{
				var food = foodArray[i];
				var netInfo = {};
				food.speedX *= 0.9;
				food.speedY *= 0.9;
				netInfo.x = food.x/GAME_SCALE + food.speedX;
				netInfo.y = -food.y/GAME_SCALE + food.speedY;
				netInfo.isFull = false;
				var packet = this.buildFoodPacket(netInfo);
				food.updateNetwork(packet, 0, false);
			}


			// Reset Time
			updateTime -= interpTime;
		}
		if(entities[snake1.id] != undefined)
			snake1.update(dt);
		if(entities[snake2.id] != undefined)
			snake2.update(dt);

		// Update Food
		var foodCount = foodArray.length;
		for(var i = 0; i < foodCount; i++)
		{
			if(entities[foodArray[i].id] != undefined){
				foodArray[i].update(dt);
			//}else{
				//break; // there's a better way to do this but i'm lazy
			}
		}

		updateTime += dt;
	};

	speedupTutorial.draw = function(context) {
		var mult = 1.0;
		if(!highQuality)
			mult = 2.0;

		var scale = 1.4/mult;
		context.save();

		context.translate((screenWidth/2.0)-(435*verticalZoom)/mult, screenHeight*0.5 - ((550*verticalZoom)*0.38)/mult);
		context.scale(scale*verticalZoom, scale*verticalZoom);

		var foodCount = foodArray.length;
		var foodInactiveCount = 0;
		for(var i = 0; i < foodCount; i++)
		{
			if(entities[foodArray[i].id] != undefined){
				foodArray[i].draw(context);
			}
			else
				foodInactiveCount++;
		}
		if(foodInactiveCount == maxFood && snake2State == 7)
		{
			waitToFadeout = true;
		}

		if(entities[snake1.id] != undefined)
		{
			snake1.drawAfter(context);
			snake1.drawAfter(context);
		}

		if(entities[snake2.id] != undefined)
		{
			snake2.drawAfter(context);
			snake2.drawAfter(context);
		}
		context.restore();
	};

	speedupTutorial.initFood = function(x, y, hue) {
		var netInfo = {};
		var food = new Food();
		food.playSounds = false;
		food.id = entityCounterID++;
		food.tutorial = true;
		netInfo.x = x;
		netInfo.y = y;
		netInfo.isFull = true;
		netInfo.hue = hue;
		var packet = this.buildFoodPacket(netInfo);
		food.updateNetwork(packet, 0, true);

		entities[food.id] = food;
		foodArray.push(food);
		return food;
	}

	speedupTutorial.initSnake = function(snakeID) {
		var netInfo = {};
		if(snakeID == 0)
		{
			snake1 = new Snake();
			snake1.playSounds = false;
			snake1.tutorial = true;
			snake1.id = entityCounterID++;
			entities[snake1.id] = snake1;
			snake1ID = snake1.id;

			netInfo.lastLen = 2;
			netInfo.curLengthDst = 30;
			netInfo.pointCount = 2;
			netInfo.flags = 0;
			netInfo.extraSpeed = 0;
			netInfo.isFull = true;
			netInfo.points = [];
			netInfo.points.push({
				x: snake1X,
				y: snake1Y
			});
			snake1X += 30;
			netInfo.points.push({
				x: snake1X,
				y: snake1Y
			});

			netInfo.x = snake1X;
			netInfo.y = snake1Y;

			netInfo.hue = snake1Hue;
			var packet = this.buildSnakePacket(netInfo);
			snake1.updateNetwork(packet, 0, true);
		}else{
			snake2 = new Snake();
			snake2.playSounds = false;
			snake2.id = entityCounterID++;
			entities[snake2.id] = snake2;
			snake2ID = snake2.id;

			snake2.tutorial = true;
			netInfo.lastLen = 2;
			netInfo.curLengthDst = snake2Length;
			netInfo.pointCount = 2;
			netInfo.flags = 0;
			netInfo.extraSpeed = 0;
			netInfo.isFull = true;
			netInfo.points = [];
			netInfo.points.push({
				x: snake2X,
				y: snake2Y
			});
			//snake2Y += 0;
			netInfo.points.push({
				x: snake2X,
				y: snake2Y
			});

			netInfo.x = snake2X;
			netInfo.y = snake2Y;

			netInfo.hue = snake2Hue;
			var packet = this.buildSnakePacket(netInfo);
			snake2.updateNetwork(packet, 0, true);
		}
	};

	speedupTutorial.clear = function() {
		if(this.isInitialized)
		{
			this.isInitialized = false;

			if(entities[snake1ID] != undefined){
				entities[snake1ID].cleanup();
				delete entities[snake1ID];
			}
			if(entities[snake2ID] != undefined){
				entities[snake2ID].cleanup();
				delete entities[snake2ID];
			}

			var foodCount = foodArray.length;
			for(var i = 0; i < foodCount; i++)
			{
				if(entities[foodArray[i].id] != undefined){
					delete entities[foodArray[i].id];
				}
			}

		}
	}

	speedupTutorial.init = function() {
		// Reset vars
		snake1X = 0;
		snake1Y = 0;
		snake2X = 8;
		snake2Y = -4;
		snake2State = 0;
		snake2Speed = minSpeed;
		snake2ExtraSpeed = 0;
		blockX = 0;
		snake2Length = 15;
		entityCounterID = 99999;
		foodArray = [];
		fadeOutNow = false;
		waitToFadeout = false;
		fadeOutWaitTime = 0;
		dropFood = false;
		alpha = 0;

		// Init snakes
		this.initSnake(0);
		this.initSnake(1);

		this.isInitialized = true;
	};
}
