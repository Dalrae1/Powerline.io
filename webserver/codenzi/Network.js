var Network = function() {
	var webSocket;
	var pingStart, pingCheckInterval = 150;
	this.hasConnection = false;
	this.sentHello = false;
	this.remoteHost = null;
	this.connectRetry = 0;
	this.lastUpdateBool = false; // This value alternates every client info. If on update, this value doesn't match to client's updateBool, the client was removed.
	this.roomNumber = 0;
	this.directed = false;
	this.roomID = 0;
	this.connectVar = null;

	// opcodes

	// Client -> Server

	var OPCODE_CS_PING = 0x00;
	var OPCODE_CS_PONG = 0x10;
	var OPCODE_HELLO = 0x01;

	var OPCODE_HELLO_V2 = 0xAE;
	var OPCODE_HELLO_V3 = 0xAF;
	var OPCODE_HELLO_V4 = 0xBF;

	var OPCODE_HELLO_DEBUG = 0xAB;
	var OPCODE_ENTER_GAME = 0x03;
	var OPCODE_LEAVE_GAME = 0x04;
	var OPCODE_INPUT = 0x05;
	var OPCODE_INPUT_POINT = 0x06;
	var OPCODE_AREA_UPDATE = 0x07;
	var OPCODE_BOOST = 0x08;
	var OPCODE_DEBUG_GRAB = 0x09;
	var OPCODE_BIG_PICTURE = 0x0B;
	var OPCODE_TALK = 0x0C;

	// Server -> Client
	var OPCODE_SC_PONG = 0x01;
	var OPCODE_SC_PING = 0x00;
	var OPCODE_CONFIG = 0xA0;
	var OPCODE_CONFIG_2 = 0xB0;
	var OPCODE_ENTERED_GAME = 0xA1;
	var OPCODE_ENTITY_INFO = 0xA3;
	var OPCODE_EVENTS = 0xA4;
	var OPCODE_LEADERBOARD = 0xA5;
	var OPCODE_MINIMAP = 0xA6;

	// Event Codes
	var EVENT_DID_KILL = 0x01;
	var EVENT_WAS_KILLED = 0x02;

	// Entity Types
	var ENTITY_ITEM = 4;
	var ENTITY_PLAYER = 5;
	var ENTITY_COLLIDER = 1;

	// Entity SubTypes
	// PLAYER
	var SUB_ENTITY_BASIC_CAR = 0;
	var SUB_ENTITY_FLAIL = 1;
	var SUB_ENTITY_CHAIN = 2;

	// ENTITY_ITEM
	var SUB_ENTITY_ITEM_FOOD = 0;
	var SUB_ENTITY_ITEM_ENERGY = 1;
	var SUB_ENTITY_ITEM_TRI_PLUS = 2;
	var SUB_ENTITY_ITEM_TRI_MINUS = 3;

	var MASTER_URL = domain;

	if(domainSplitLen == 1 || domainSplitLen == 3) /* localhost */
	{
		// Testing locally, connect to local master server
		// OR
		// Dev. Connect to dev master server. Dont reveal where it is at.
		MASTER_URL = domain+':81/';
	}else{
		// Use default master server. Allow people to iframe and etc.
		MASTER_URL = 'master.'+domain;
	}
	//console.log('Master URL is: ' + MASTER_URL);

	this.getServerAndConnect = function() {
		var room = null;
		var roomPart = '';

		var locationHash;

		if(!inIframe())
		locationHash = parent.location.hash

		if(locationHash)
		{
			var hash = locationHash;
			room = hash.substring(1, hash.length);
			roomPart = ';'+room;
			network.directed = true;
		}else{
			if(queryString['ip'])
			{
				var ip = queryString['ip'];
				ip = ip.replace("%3A", ":");
				network.remoteHost = ip;
				network.connect();
				//console.log('call connect 1');
				return;
			}
		}

		var cc = countryCode;
		if(queryString['cc'])
		cc = queryString['cc'];
		if(cc == undefined)
		{
			// Did not receive country code yet
			setTimeout(network.getServerAndConnect, 200);
			return;
		}
		if (cc == "CU") {
			let actualDomain = window.location.href.split('/')[2].split(":")[0];
			network.remoteHost = `${actualDomain}`
			let fullhost
			if (isSecure)
				fullhost = `wss://${network.remoteHost}:1338`;
			else
				fullhost = `ws://${network.remoteHost}:1337`;
			console.log('Connecting to ' + fullhost + '...');
			webSocket = new WebSocket(fullhost);
			webSocket.binaryType 	= "arraybuffer";
			webSocket.onopen 		= network.onSocketOpen;
			webSocket.onclose		= network.onSocketClose;
			webSocket.onmessage 	= network.onSocketMessage;
			webSocket.onerror = network.onError;
			return
		}

		var s = '';
		if(isSecure)
		s = 's';
		$.ajax({
			url: 'http'+s+'://'+MASTER_URL,
			type: 'PUT',
			success: function(result) {
				if(result == '0')
				{
					$('#topGui').hide();
					$('#topGuiConnecting').hide();
					$('#roomFailed').show();
					return;
				}

				var splitID = result.split('!');
				network.roomID = 0;
				if(splitID.length > 1)
				{
					network.roomID = splitID[1];
				}

				var remaining = splitID[0];
				var splitRoom = remaining.split('/');
				network.roomNumber = 0;
				var host = remaining;
				if(splitRoom.length > 1){
					network.roomNumber = splitRoom[1];
					host = splitRoom[0];
				}
				network.remoteHost = host;
				network.connect();

			},
			error: function(){
				network.connectVar = setTimeout(network.getServerAndConnect, 1000);
			},
			'dataType': "text", // was json
			'contentType': "text/plain",
			'method': "PUT",
			'cache': false,
			'crossDomain': true,
			'data': cc+roomPart
		});

	};

	this.connect = function() {
		// WebSocket

		if(!focus && !debug)
		{
			setTimeout(network.getServerAndConnect, 100);
			return;
		}

		var fullhost = 'ws://' + network.remoteHost;

		if(isSecure){
			var addr = network.remoteHost;
			var splt = addr.split(':');
			var ip = splt[0];
			var port = splt[1];
			var brip = ip.split('.');
			var sslPort;
			sslPort = parseInt(port)+1000;
			if(network.roomNumber > 0)
				sslPort = parseInt(network.roomNumber)+8080+1000;
			fullhost = 'wss://'+brip[0]+'-'+brip[1]+'-'+brip[2]+'-'+brip[3]+'.'+gameName+':'+sslPort;
		}else{
			if(network.roomNumber > 0){
				var addrSplit = fullhost.split(':');
				fullhost = 'ws:'+addrSplit[1] + ':' + (parseInt(network.roomNumber)+8080);

				// For some reason, some people compain about "Connecting" forever because of this.
				//fullhost = fullhost + '/' + network.roomNumber;
			}
		}
		if(debug)
			console.log('Connecting to ' + fullhost + '...');
		try{
			webSocket = new WebSocket(fullhost);
		}catch(e)
		{
			setTimeout(network.getServerAndConnect, 1000);
			return;
		}
		webSocket.binaryType 	= "arraybuffer";
		webSocket.onopen 		= network.onSocketOpen;
		webSocket.onclose		= network.onSocketClose;
		webSocket.onmessage 	= network.onSocketMessage;
		webSocket.onerror 		= network.onError;
	};

	this.disconnect = function() {
		if(network.directed){
			if(!inIframe())
			{
				window.location.hash = '';
			}
			network.directed = false;
		}
		network.roomID = 0;
		if(webSocket)
			webSocket.close();
	};

	this.onSocketOpen = function(e) {
		if(network.connectVar)
		{
			clearTimeout(network.connectVar);
		}

		if(debug)
			console.log('Connected!');
		network.connectRetry = 0;
		network.hasConnection = true;
		network.directed = false;
		if(resources.loaded){
			network.hello();
		}
	};

	this.onSocketClose = function(e) {
		//console.log('Socket closed!', e);
		network.connectionClosed();
	};

	this.onSocketMessage = function(e) {
		network.processMessage(e.data);
	};

	this.onError = function(e) {
		console.log("socket error");
	};

	this.hello = function() {
		network.sendHello(); // Hello
		network.ping();
		network.sentHello = true;

		$('#copyLink').fadeIn(300);
		$('#topGui').show();
		$('#topGuiConnecting').hide();

		var buttons = $('.btn-needs-server');
		buttons.removeAttr('disabled');

		$('#nick').focus();
	}

	// TODO: This should go to a different file
	function CreateEntity(type, subType){
		var entity = null;
		switch(type)
		{
			case ENTITY_PLAYER:
			{
				entity = new Snake();
				break;
			}
			case ENTITY_ITEM:
			{
				if(subType == SUB_ENTITY_ITEM_FOOD)
					entity = new Food();
				else if(subType == SUB_ENTITY_ITEM_ENERGY)
					entity = new Energy();
				else if(subType == SUB_ENTITY_ITEM_TRI_PLUS || subType == SUB_ENTITY_ITEM_TRI_MINUS)
					entity = new Tri(subType);
				break;
			}
			case ENTITY_COLLIDER:
			{
				if(subType == SUB_ENTITY_BOUNDARY)
				{
					entity = new Boundary();
				}else{
					entity = new Collider(subType);
				}
				break;
			}
			default:
			{
				console.log('ERROR: Creating unknown entity type: ' + type + ' Subtype: ' + subType);
				assert(false, 'Invalid Entity');
				break;
			}
		}
		return entity;
	}

	function processEvents(view){
		var offset = 1; // Skip opcode

		while(true)
		{
			var byte_ = view.getUint8(offset, true);
			offset += 1;

			if(byte_ == 0x0)
			break;

			switch(byte_)
			{
				case EVENT_DID_KILL:
				{
					var id = view.getUint16(offset, true);
					offset+=2;

					var res = getString(view, offset);
					var nick = res.nick;
					offset = res.offset;

					hud.addMessage('Killed', HUD_TOP, getPlayerName(nick));
					killStreak++;
					camera.shake(7.0);
					break;
				}
				case EVENT_WAS_KILLED:
				{
					var id = view.getUint16(offset, true);
					offset+=2;

					var res = getString(view, offset);
					var nick = res.nick;
					offset = res.offset;

					hud.addMessage('Killed by ', HUD_BOTTOM, getPlayerName(nick));
					//camera.shake();

					statLastKiller = getPlayerName(nick);
					//console.log('Killed by ' + nick);
					break;
				}
				default:
					console.log('Unknown event code');
				break;
			}
		}
	}

	function processLeaderboard(view){
	var offset = 1; // Skip opcode

		var leaderboardInfo = [];
		var containsData = false;
		while(true)
		{
			// Just to check if we should break
			var id = view.getUint16(offset, true);
			offset += 2;
			if(id == 0x0){
				break;
			}

			containsData = true;

			var score;
			score = view.getUint32(offset, true);
			offset += 4;

			// If not 0x0, then it's a string. Lets read it.
			var res = getString(view, offset);
			var nick = res.nick;
			offset = res.offset;

			//console.log('Nick: ' + nick + ' Score: ' + score);

			var leaderboardItemInfo = {};
			leaderboardItemInfo.nick = nick;
			leaderboardItemInfo.score = score;
			leaderboardItemInfo.id = id;
			leaderboardInfo.push(leaderboardItemInfo);
		}

		if(containsData)
		{
			hud.refreshLeaderboard(leaderboardInfo);
		}

		return offset;
	}

	function updateEntities(view){
		var offset = 1; // Skip opcode

		while(true)
		{

			var id = view.getUint16(offset, true);
			offset += 2;

			if(id == 0x0){
				if(offset != view.byteLength)
				{
					kingID = view.getUint16(offset, true);
					offset += 2;
					if(kingID > 0)
					{
						var kingX = view.getFloat32(offset, true);
						offset += 4;
						var kingY = -view.getFloat32(offset, true);
						offset += 4;

						kingPositionOrig.x = kingPosition.x;
						kingPositionOrig.y = kingPosition.y;
						kingPositionDst.x = kingX*GAME_SCALE;
						kingPositionDst.y = kingY*GAME_SCALE;
						kingUpdateTime = now;
					}
				}
				break;
			}

			var flags = view.getUint8(offset, true);
			offset += 1;

			//console.log('updateEntities: ' + flags + ' EntityID: ' + id);

			var entity;
			switch(flags)
			{
				case 0x0: // Partial

				entity = entities[id];
				if(entity)
					offset = entity.updateNetwork(view, offset, false);
				else
					console.log('entity with id: ' + id + ' not found'); //debug.log();
				break;
				case 0x1: // Full

				var entityType = view.getUint8(offset, true);
				offset += 1;

				var entitySubType = view.getUint8(offset, true);
				offset += 1;

				//console.log('Creating new entity: ' + entityType);

				// Get Nick if available
				// WARNING: this should go to entity updateNetwork
				var res = getString(view, offset);
				var nick = res.nick;
				if(nick.indexOf('﷽') != -1){
					nick = '<Unnamed>';
				}

				offset = res.offset;

				// Create entity according to entityType and entitySubType
				var entity = CreateEntity(entityType, entitySubType);
				if(entity)
				{
					entity.nick = nick;
					entity.id = id;
					entities[id] = entity;
					offset = entity.updateNetwork(view, offset, true);
				}else{
					console.log('Unable to create entity. Entity Type is: ' + entityType);
				}
				break;
				case 0x2: // Delete
				{
					var killedByID = view.getUint16(offset, true);
					offset += 2;

					var killReason = view.getUint8(offset);
					offset += 1;

					var entity = entities[id];
					if(entity){
						entity.killReason = killReason;
						entity.killedByID = killedByID;
						var isSelf = entity == localPlayer;
						offset = entity.deleteNetwork(view, offset);
						if(isSelf)
						{
							if(isInGame){
								isInGame = false;
								localPlayer = null;
								wasKilled();
								if(!showBigPicture)
									fadeinUI();
							}
						}
					}else{
						// Something went wrong, lets refresh browser - quick fix
						console.log('ERROR: Entity does not exist: ' + id);
						window.location.href = window.location.href;
					}
				}
				break;
				default:
					console.log('Invalid entity flag');
				break;
			}

		}
	}

	this.processConfig = function(view, op) {
		var offset = 1;

		var hasSmartResize = false;
		if(op == OPCODE_CONFIG_2)
			hasSmartResize = true;

		var cfg_arenaSide = view.getFloat32(offset, true);
		offset += 4;

		arenaWidth = cfg_arenaSide * GAME_SCALE;
		arenaHeight = cfg_arenaSide * GAME_SCALE;

		if(hasSmartResize)
		{
			arenaCenterX = view.getFloat32(offset, true) * GAME_SCALE;
			offset += 4;
			arenaCenterY = view.getFloat32(offset, true) * GAME_SCALE;
			offset += 4;
		}

		if(debug)
			console.log(arenaWidth/GAME_SCALE);

		defaultZoom = view.getFloat32(offset, true);
		offset += 4;
		minZoom = view.getFloat32(offset, true);
		offset += 4;
		minZoomScore = view.getFloat32(offset, true)*GAME_SCALE;
		offset += 4;
		startLength = view.getFloat32(offset, true)*GAME_SCALE;
		offset += 4;

		// Skip Mobile Version
		offset += 4;

		globalWebLag = view.getFloat32(offset, true);
		offset += 4;
		globalMobileLag = view.getFloat32(offset, true);
		offset += 4;

		if(globalWebLag == 0)
			antiLagEnabled = false;
		else
			antiLagEnabled = true;

		lagAddRender = view.getFloat32(offset, true);
		offset += 4;

		talkEnabled = view.getFloat32(offset, true);
		offset += 4;

		//console.log('Lag: ' + globalWebLag);
		//console.log('LagLenMult: ' + lagLenMult);
		receivedConfig = true;
	}

	var lastPosTime;
	this.processMessage = function(data) {
		var view = new DataView(data);
		var op = view.getUint8(0);
		//if(op != 0x0)
		//	console.log('OP: ' + op.toString(16).toUpperCase());
		if(op == OPCODE_SC_PONG)
		{
			if(statsVisible){
				var pingEnd = +new Date();
				var pingTime = pingEnd - pingStart;
				if(statsLAG)
					statsLAG.updateLag(pingTime);

				if(pingTime > pingCheckInterval)
				{
					this.ping();
				}else{
					setTimeout(function(){
						network.ping();
					}, pingCheckInterval - pingTime);
				}
			}
		}else if(op == OPCODE_SC_PING)
		{
			var offset = 1;
			myPing = view.getUint16(offset, true);
			offset += 2;

			//console.log(myPing);

			//setTimeout(function(){
			//	console.log('PING RECEIVED FROM SERVER');
				network.pong();
			//}, 150);
		}else if(op == OPCODE_CONFIG || op == OPCODE_CONFIG_2)
		{
			this.processConfig(view, op);
		}else if(op == OPCODE_ENTERED_GAME)
		{
			//console.log('Did Enter Game!');

			didFirstClick();

			var offset = 1;
			var id = view.getUint32(offset, true); // This is my ID
			offset += 4;

			//console.log('Entered with ID: ' + id);
			localPlayerID = id;

			isInGame = true;
			statBeginTime = +new Date();
			hideUI();

		}else if(op == OPCODE_ENTITY_INFO)
		{
			// Detect lag - Debug
			var currentTime = +new Date();
			var delta = (currentTime - lastPosTime);
			//if(delta > 150)
				//console.log('Delta: ' + delta + ' - LAG WARNING !');
			lastPosTime = currentTime;

			updateEntities(view);
			updateTitle();
		}else if(op == OPCODE_EVENTS)
		{
			processEvents(view);
		}else if(op == OPCODE_LEADERBOARD)
		{
			var offset = processLeaderboard(view);
			var id = view.getUint16(offset, true);
			offset += 2;

			if(id > 0)
			{
				var score = view.getUint32(offset, true);
				offset += 4;

				var rank = view.getUint16(offset, true);
				offset += 2;

				hud.updateRank(rank, score);

				if(statTopPosition == 0 || statTopPosition > rank)
					statTopPosition = rank;

				if(statLength == 0 || statLength < score)
					statLength = score;

				//console.log('Update Leaderboard: ' + id + ' Score: ' + score + ' Rank: ' + rank);
			}else{
				hud.updateRank(0, 0);				
			}
		}/*else if(op == OPCODE_MINIMAP)
		{
			minimap.updateInfo(view);
		}*/
	}

	this.connectionClosed = function() {
		app.gameCleanup();
		network.sentHello = false;
		network.hasConnection = false;

		fadeinUI(-1);
		$('#topGui').hide();
		$('#topGuiConnecting').show();
		$('#copyLink').fadeOut(300);

		var buttons = $('.btn-needs-server');
		buttons.attr('disabled','disabled');

		var retryIn = this.connectRetry
		if(retryIn > 5)
			retryIn = 5;

		if(focus){
			//console.log('getServerAndConnect 3');
			setTimeout(this.getServerAndConnect, 1000 + retryIn*1000);
		}
		network.connectRetry++;
	};

	this.sendSingleByte = function(b) {
		var buf = new ArrayBuffer(1);
		var view = new DataView(buf);
		view.setUint8(0, b);
		webSocket.send(buf);
	}

	this.sendHello = function() {
		var buf = new ArrayBuffer(1+2+2);
		var view = new DataView(buf);
		if(debug)
			view.setUint8(0, OPCODE_HELLO_DEBUG);
		else
			view.setUint8(0, OPCODE_HELLO_V4);

		view.setUint16(1, (screenWidth/GAME_SCALE)*visionPerc, true);
		view.setUint16(3, (screenHeight/GAME_SCALE)*visionPerc, true);
		webSocket.send(buf);
	}

	this.sendNick = function(nick, countingDown) {
		myName = nick;
		var buf = new ArrayBuffer(3 + nick.length * 2);
		var view = new DataView(buf);
		var op = OPCODE_ENTER_GAME;
		view.setUint8(0, op);

		for(var i = 0; i < nick.length; ++i){
			view.setUint16(1 + i * 2, nick.charCodeAt(i), true);
		}
		webSocket.send(buf);
	}

	this.sendTurnPoint = function(direction, coord) {
		var buf = new ArrayBuffer(1 + 1 + 4 + 4 + 1);
		var view = new DataView(buf);
		var offset = 0;
		view.setUint8(offset, OPCODE_INPUT_POINT);
		offset += 1;
		view.setUint8(offset, direction, true);
		offset += 1;

		view.setFloat32(offset, coord, true);
		offset += 4;

		var flags = 0x0;
		if(!focus || UIVisible)
		flags = flags | 0x1; // Paused ?

		view.setUint8(offset, flags, true);
		webSocket.send(buf);
	}

	this.sendDirection = function() {
		var buf = new ArrayBuffer(1 + 1 + 1);
		var view = new DataView(buf);
		view.setUint8(0, OPCODE_INPUT);
		view.setUint8(1, input.direction, true);

		var flags = 0x0;
		if(!focus || UIVisible)
		flags = flags | 0x1; // Paused ?

		// Note: Add a bit at 0x2 if this is a bot

		view.setUint8(1+1, flags, true);
		webSocket.send(buf);
	}

	this.sendResize = function() {
		var buf = new ArrayBuffer(1+2+2);
		var view = new DataView(buf);
		view.setUint8(0, OPCODE_AREA_UPDATE);

		var mult = 1.0;
		if(!highQuality)
			mult = 2.0;

		view.setUint16(1, (screenWidth/GAME_SCALE)*visionPerc*mult, true);
		view.setUint16(3, (screenHeight/GAME_SCALE)*visionPerc*mult, true);
		webSocket.send(buf);
	}

	this.sendBoost = function(boosting) {
		var buf = new ArrayBuffer(1 + 1);
		var view = new DataView(buf);
		view.setUint8(0, OPCODE_BOOST);
		if(boosting)
			view.setUint8(1, 0x1);
		else
			view.setUint8(1, 0x0);

		webSocket.send(buf);
	}
	/*
	this.sendClick = function(shooting) {
		var buf = new ArrayBuffer(1 + 1);
		var view = new DataView(buf);
		view.setUint8(0, OPCODE_CLICK);
		if(shooting)
		view.setUint8(1, 0x1);
		else
		view.setUint8(1, 0x0);

		webSocket.send(buf);
	}
	*/

	this.leave = function() {
		var buf = new ArrayBuffer(1);
		var view = new DataView(buf);
		view.setUint8(0, OPCODE_LEAVE_GAME);
		webSocket.send(buf);
	}

	this.bigPicture = function() {
		var buf = new ArrayBuffer(1);
		var view = new DataView(buf);
		view.setUint8(0, OPCODE_BIG_PICTURE);
		webSocket.send(buf);		
	}

	this.debugFoodGrab = function() {
		var buf = new ArrayBuffer(1);
		var view = new DataView(buf);
		view.setUint8(0, OPCODE_DEBUG_GRAB);
		webSocket.send(buf);		
	}

	this.sendTalk = function(dialogID) {
		var buf = new ArrayBuffer(2);
		var view = new DataView(buf);
		view.setUint8(0, OPCODE_TALK);
		view.setUint8(1, dialogID);
		webSocket.send(buf);		
	}

	this.ping = function() {
		if(!this.hasConnection)
			return;

		var buf = new ArrayBuffer(1);
		var view = new DataView(buf);
		view.setUint8(0, OPCODE_CS_PING);
		webSocket.send(buf);
		pingStart = +new Date();
	}

	this.pong = function() {
		if(!this.hasConnection)
			return;
		var buf = new ArrayBuffer(1);
		var view = new DataView(buf);
		view.setUint8(0, OPCODE_CS_PONG);
		webSocket.send(buf);
	}
}
