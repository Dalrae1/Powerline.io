// Debug
var version = 1.05;
var href = window.location.href;
var urlSplit = href.split('/');
var domain = "powerline.io"/*urlSplit[2]*/;
//domain = domain.split(':')[0];
var domainSplit = domain.split('.');
lastPart = urlSplit[urlSplit.length-1];
var domainSplitLen = domainSplit.length;
//if(domainSplitLen > 2)
//	debug = !debug;

var gameName = 'powerline.io';
var protocol = window.location.protocol;
var isSecure = (protocol == 'https:');
var serverListLoaded = false;

// Performance Stats
var statsFPS, statsLAG;

// Admin
var commandPallete = false;

// Game Stats
var statTopPosition = 0;
var statLength = 0;
var statKillStreak = 0;
var statBeginTime = 0;
var statLastKiller = '';
var statKillReason = 0;

// Constants
var POST_KILL_SPEED_PERC = 0.4;
var UPDATE_EVERY_N_TICKS = 3;
var INTERP_TIME = (1000/30)*UPDATE_EVERY_N_TICKS;
var GAME_SCALE = 10.0;
var DEGTORAD = 0.0174532925199432957;
var RADTODEG = 57.295779513082320876;
var INPUT_MOUSE_ONLY 		= 0;
var INPUT_KEYBOARD_ONLY 	= 1;
var MIN_THROTTLE_DISTANCE	= 75.0;
var MAX_LEADERBOARD_ENTRIES = 10;
var SPECTATE_FOLLOW			= 0;
var SPECTATE_FREE			= 1;
var PLANE_SPLASH_TIME		= 5;
var IN_FLAMES_ENERGY		= 25;
var ITEM_OFFSET_FADE_OVER_BOTTOM = 20;
var KILLS_TO_FOLLOW = 4;

// Directions
var DIRECTION_NONE = 0;
var DIRECTION_UP = 1;
var DIRECTION_LEFT = 2;
var DIRECTION_DOWN = 3;
var DIRECTION_RIGHT = 4;

// Some network stuff
// Kill Reasons
var KILL_REASON_LEFT_SCREEN = 0;
var KILL_REASON_KILLED = 1;
var KILL_REASON_BOUNDARY = 2;
var KILL_REASON_SUICIDE = 3;

// Shapes
var SHAPE_CIRCLE = 0x01;
var SHAPE_POLY = 0x02;

// Input
var input;
var mouse = {x:0,y:0};
var mouseDirection = {x:0,y:0};
var mouseWorldPos;
var inputType = INPUT_MOUSE_ONLY;
var worldScreenCenter = {x: 0, y:0};
var worldScreenDelta = {};

// Config Vars
var arenaHeight = 1600.0;
var arenaWidth = 5000.0;
var arenaCenterX = 0.0;
var arenaCenterY = 0.0;
var defaultZoom = 1.4;
var minZoom = 1.0;
var minZoomScore = 100;
var startLength = 20;

// Variables
var screenWidth, screenHeight;
var isInGame = false;
var focus = true;
var lastFocus = false;
var now = 0, prevNow = 0;
var spectateMode = SPECTATE_FREE;
var UIVisible = true;
var playerCount = 0;
var defaultRetinaValue = 1.0;
var countingDown = false;
var countDownBeginDate;
var currentScore = 0;
var invulnerableTimeSeconds = 3.0;
var zoomAdjust = 1.0;
var playClicks = 0;
var spectateClicks = 0;
var highlightBots = false;
var highQuality = true;
var noNames = false;
var visionPerc = 1.0;
var gameZoom = 1.2;
var targetZoom = defaultZoom;
var zoomOut = false;
var receivedConfig = false;
var myPing = 0;
var verticalZoom = 0;
var killCount = window.localStorage.killCount;
if(killCount == undefined || killCount == 'undefined'){
	killCount = 0;
}

var killStreak = 0;
var showBigPicture = false;
var darkenOverlay = false;

// Ads
var readyToRefreshAd = true;
var refreshAdInterval = 2; // In minutes
var firstClick = false;
var showAds = true;
var adShowCount = 0;

// Drawing - Debug
var drawExplosions = true;
var drawEntities = true; // Added for IOEngine
var drawHud = true;
var drawBoundaries = false;
var drawSpeed = false;
var drawAABB = false;
var drawFood = true;
var glowSnakes = true;
var drawServerPos = false;
var statsVisible = false;

// Game vars
var app;
var animationManager;
var resources;
var network;
var entities = {};
var leaderboardIDs = [];
var localPlayer;
var localPlayerID = 0;
var prevLocalPlayer;
var camera;
var hud;
var effects;
var map;
var minimap;

// King
var kingID = 0;
var prevKingID = 0;
var kingPosition = {x: 0, y: 0};
var kingPositionOrig = {};
var kingPositionDst = {};
var kingUpdateTime = 0;

var lastKillerID = 0;
var cameraSmooth = 1.0;
var copyingLink = false;
var mouse;

// Anti-Lag Vars
var globalWebLag = 110;
var globalMobileLag = 50;
var antiLagEnabled = true;
var lastTurnTime = 0;
var lagAddRender = 40;

var talkEnabled = false;

var HUD_TOP = 0;
var HUD_BOTTOM = 1;
var HUD_SPECIAL = 2;

// Sound
var lineLoopSound, crashSound, sparkSound;
var soundManager;
var masterVolume = 1.0;
var muteVolume = window.localStorage.muteVol;
if(muteVolume == undefined || muteVolume == 'undefined'){
	muteVolume = 1.0;
}

//delete window.localStorage.arrows; // Enable tutorial again
var spacePressedShowTutorialTime = 0;
var arrows = window.localStorage.arrows;
var inGameSpeedTutorial = window.localStorage.speedUpTut;
if(!inGameSpeedTutorial)
	inGameSpeedTutorial = 0;

// Talk Options
var talkTexts = [
				 "LOL",
				 "EASY!",
				 "OOPS!",
				 "I DARE YOU!",
				 "GOTCHA!",
				 "RUN!",
				 "TEAM?",
				 "YES!",
				 "NO!",
				 "KILL THE KING!"
				 ];

if(!inGameSpeedTutorial)
{
	if(killCount > 3)
	{
		inGameSpeedTutorial = 1;
		window.localStorage.speedUpTut = inGameSpeedTutorial;
	}
}

//if(queryString['na']){
	//showAds = false;
//}

if(window.localStorage.lq == 'true'){
	highQuality = false;
}

// Show updated stamp if needed
//if(window.localStorage.version != undefined || window.localStorage.version < version)
//{
//	window.localStorage.version = version;
//	$('#updated').show();
//}

// Country Code



var countryCode = null;

function updateCCButton() {
	let button = document.getElementsByClassName(`${countryCode}`)[0]
	if (!button)
		countryCode = "01"
	button = document.getElementsByClassName(`${countryCode}`)[0]
	button.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
}

var fetchCountryCode = function(){
	var s = '';
	if(isSecure)
		s = 's';
	$.get('http'+s+'://ip2l.wings.io/cc', function(data){
		countryCode = data.substring(0, 2);
		window.localStorage.wingsCC = countryCode;
		window.localStorage.wingsCCTime = +new Date();
		updateCCButton()
		//console.log('Fetched new country code: ' + countryCode);
	}, 'text');
}

var updateCountryCode = function(){
	if(window.localStorage.wingsCCTime == undefined || (window.localStorage.wingsCC != undefined && window.localStorage.wingsCC.length != 2))
	{
		fetchCountryCode();
	}else{
		var timePassed = +new Date() - window.localStorage.wingsCCTime;
		if(timePassed > 1000*60*60*8) // 8 hours passed? Update country code. The user could travel to another country.
		{
			fetchCountryCode();
		}else{
			countryCode = window.localStorage.wingsCC;
		}
	}
}

function selectServer(serverIp, port) {
	console.log("pressed")
	network.disconnect();
	network.connect(serverIp, port);

}

//updateCountryCode();
//updateCCButton()

var runLoop = function() {
	now = +new Date();
	var dt = 0;
	if(prevNow > 0)
		dt = now - prevNow;
	prevNow = now;

	app.update(dt);
	app.draw(dt);

/*
	// Counting frames manually
	if(dtx > 1000.0)
	{
		console.log('FPS: ' + frames);
		frames = 0;
		dtx = 0.0;
	}
	dtx += dt;
	frames++;
*/
	if(window.requestAnimationFrame)
		window.requestAnimationFrame(runLoop);
	if(lastFocus)
		lastFocus = false;
}

var initApp = function() {
	if (app!=null) { return; }

	if(window.devicePixelRatio)
		defaultRetinaValue = window.devicePixelRatio > 1 ? 2 : 1;

	app = new App(document.getElementById('canvas'));

	window.addEventListener('resize', app.resize, false);

	input = new Input();
	input.addListeners();

	if(window.requestAnimationFrame){
		window.requestAnimationFrame(runLoop);
	}else{
		setInterval(runLoop, 1000 / 60); // Can this really happen?
	}

	$('#overlay').show();
}

var init = function() {
	//if(debug)
	addStats();
	addCommandPallete()
	if(Modernizr.canvas && Modernizr.websockets) {
		initApp();
		app.resize();
		updateGraphicsLabel();
	} else {
		if(debug) {
			// TODO: Display some nice error message in the webpage
			console.log('unsupported-browser!');
		}
	}
}

var addCommandPallete = function () {
	if (commandPallete) { return; }
	commandPallete = new CommandPallete();
	var canvas = document.getElementById('canvas');
	var offsetY = 30;
	var percPosX = 0.0;
	// align bottom right
	commandPallete.domElement.style.position = 'absolute';
	commandPallete.domElement.style.left = (canvas.width*percPosX)+'px';
	commandPallete.domElement.style.top = (canvas.height - 18 - offsetY)+'px';

	document.getElementById('commandpallete').appendChild(commandPallete.domElement);


	
}

var addStats = function() {
	// FPS
	statsLAG = new Stats();
	statsLAG.setMode( 1 );
	var canvas = document.getElementById('canvas');
	var offsetY = 30;
	var percPosX = 0.25;
	// align bottom right
	statsLAG.domElement.style.position = 'absolute';
	statsLAG.domElement.style.left = (canvas.width*percPosX)+'px';
	statsLAG.domElement.style.top = (canvas.height - 18 - offsetY)+'px';

	document.getElementById('fps').appendChild(statsLAG.domElement);

	// Draw FPS
	statsFPS = new Stats();

	// align bottom right
	statsFPS.domElement.style.position = 'absolute';
	statsFPS.domElement.style.left = (canvas.width*percPosX - 100)+'px';
	statsFPS.domElement.style.top = (canvas.height - 18 - offsetY)+'px';

	document.getElementById('fps').appendChild(statsFPS.domElement);

	setInterval(function () {
	    statsFPS.update();
	}, 1000/60);

		statsLAG.domElement.style.visibility = "hidden";
		statsFPS.domElement.style.visibility = "hidden";
}

document.body.onselectstart = function() { return false; }

function cancelCountdown()
{
	countingDown = false;
	$('#beta').show();
	hideContinueScreen();
}

function isSafari()
{
	var is_chrome = navigator.userAgent.indexOf('Chrome') > -1;
	var is_safari = navigator.userAgent.indexOf("Safari") > -1;
	if ((is_chrome)&&(is_safari)) {is_safari=false;}
	return is_safari;
}

window['clickPlay'] = function(str){
	app.clearSpeedupTutorial();
	if(!network.hasConnection){
		$('#topGui').hide();
		$('#topGuiConnecting').show();
		return;
	}

	if(isInGame){
		hideUI();
		return;
	}

	window.localStorage.nick = str;

	playClicks++;
	input.mouseMoved = false;
	network.sendNick(str, countingDown);

	if(playClicks < 6 && hud)
	{
		if(playClicks%3 == 0)
			//hud.showTip('Press T to Talk', 4000);
			//hud.showTip('Press \'F\' to Toggle Fullscreen', 4000);
		//else
			hud.showTip('Press \'M\' to Toggle Sounds', 4000);
	}

	if(countingDown)
	{
		hideContinueScreen();
		countingDown = false;
	}
}

window['setSpectate'] = function(str){
	/*
	didFirstClick();
	setCursorPointer();

	hideUI();
	spectateClicks++;

	cancelCountdown();
	if(isInGame)
	{
		// Leave Game
		network.leave();
		isInGame = false;
		app.waitUntilNextFollow();
	}else{
		app.followTopPlayer();
	}

	spectateMode = SPECTATE_FOLLOW;

	if(spectateClicks%2 || playerCount <= 1){
		hud.showTip('Press \'ESC\' to go back');
	}else{
		hud.showTip('Click to follow next player');
	}
	*/
}

window['setContinue'] = function(){
	$('#topGui').show();
	$('#roomFailed').hide();
	if(!inIframe())
		parent.location.hash = '';
	network.connect();
}

function updateGraphicsLabel()
{
	var graphicsText = 'LOW';
	if(highQuality)
		graphicsText = 'HIGH';

	var graphics = $('#graphicsID')[0];
	if(graphics)
		graphics.childNodes[0].data = 'GRAPHICS: ' + graphicsText;
}

window['toggleGraphics'] = function(){
	highQuality = !highQuality;
	app.resize();
	window.localStorage.lq = !highQuality;
	updateGraphicsLabel();
}
let but = document.querySelector("#CU")
window['copyRoomLink'] = function(){
	$('#copyLink').hide();
	$('#copyLinkBox').show();
	var label = $('#roomlinkInput')[0];
	label.value = 'http://'+gameName+'/#'+network.roomID;
	copyingLink = true;

	var is_safari = isSafari();
	if(is_safari){
		$('#copyButton')[0].childNodes[0].data = "Close";
		$('#safariTooltip').show();
	}

	setTimeout(function(){
		label.setSelectionRange(0, label.value.length);
		label.select();
		label.focus();
	}, 100);
}

window['setCopy'] = function(){
	var label = $('#roomlinkInput')[0];
	label.value = 'http://'+gameName+'/#'+network.roomID;
	label.setSelectionRange(0, label.value.length);
	label.select();
	label.focus();

	var is_safari = isSafari();
	if(is_safari){
		$('#copyLinkBox').hide();
		$('#copyLink').show();
		copyingLink = false;
		return;
	}

	try {
		document.execCommand('copy');
	} catch (e) {}

	copied();
}

function restorePlayWithfriends()
{
	$('#pfArrow').show();
	$('#pfText').show();
}

function friendArrowTintBlack()
{
	$('#pfText').css({ '-webkit-filter': 'brightness(0%)' });
	$('#pfArrow').css({ '-webkit-filter': 'brightness(0%)' });
}

function friendArrowTintWhite()
{
	$('#pfText').css({ '-webkit-filter': 'brightness(100%)' });
	$('#pfArrow').css({ '-webkit-filter': 'brightness(100%)' });
}

function copied()
{
	$('#copycheckimage').hide();
	$('#copyLink').show();
	$('#copyLinkBox').hide();
	$('#overlay2').fadeIn(200);
	$('#pfArrow').hide();
	$('#pfText').hide();

	setTimeout(function(){
		$('#copycheckimage').fadeIn(300);
	}, 200);

	setTimeout(function(){
		$('#overlay2').fadeOut(200);
		$('#nick').focus();
	}, 1000);
	copyingLink = false;
}

window['clickNoNames'] = function(element){
	noNames = !noNames;
	element.checked = noNames;
}

var ua = window.navigator.userAgent;
var usingIE = (ua.indexOf('MSIE ') > -1) || (ua.indexOf('Trident/') > -1);

if(typeof window.orientation !== 'undefined')
{
	window.location.href = "https://play.google.com/store/apps/details?id=com.profusionstudios.powerlineio";
	//console.log('is mobile!');
}

/*
if((ua.indexOf("Android") != -1 || ua.indexOf("iPhone") != -1 || ua.indexOf("iPad") != -1 || ua.indexOf("iPod") != -1) && !debug){
	window.location.href = "http://wings.io/m";
}
*/

if(usingIE)
{
	$('#sndIcon').hide();
}


function disconnect()
{
	if(network)
		network.disconnect();
}
var disconnectTimer;
window.onblur = function() {
	if(!debug)
		disconnectTimer = setTimeout(disconnect, 1000*60*5);
	focus = false;
	masterVolume = 0.0;

	for(var id in entities) {
		var entity = entities[id];
		if(entity.snake == true)
		{
			entity.onBlur();
		}
	}
}

window.onfocus = function(element) {
	if(element && element.target != window)
		return;

	if(disconnectTimer){
		clearTimeout(disconnectTimer);
		disconnectTimer = null;
	}

	focus = true;
	lastFocus = true;

	// Resume entities
	for(var id in entities) {
		entities[id].resume();
	}

	if(network && !network.hasConnection && !inIframe())
	{
		network.connect();
	}else{
		if(UIVisible)
			$('#nick').focus();
	}
	if(muteVolume == 1.0)
		masterVolume = 1.0;
}

function hideUI()
{
	$('#overlay').hide();
	UIVisible = false;
}

function showUI()
{
	$('#overlay').show();

	refreshAd();

	UIVisible = true;
	if(!isInGame)
	{
		localPlayer = null;
	}
}

function updateCountdown(){
	if(!countingDown)
		return;

	var delta = Math.floor((now - countDownBeginDate)/1000);
	if(delta < 0)
		delta = 0;
	var secondsLeft = 10 - delta;
	if(secondsLeft < 0)
	{
		countingDown = false;
		hideContinueScreen();
		return;
	}
	var curValue = secondsLeft;
	var countdownText = $('#countdownText')[0];
	var t = document.createTextNode(curValue);
	countdownText.replaceChild(t, countdownText.firstChild);
	setTimeout(updateCountdown, 500);
}

function showCountdownScreen()
{
	$('#continueTop').show();
	$('#continueBR').show();
	$('#continue').show();

	$('#nickInput').hide();
	$('#skinPanel').hide();
	$('#howto').hide();

	countingDown = true;
	resetCountdown();
	updateCountdown();
}

function updateStats()
{
	$('#basePanel').hide();
	$('#statsPanel').show();

	// KILLED BY
	var title;
	if(statKillReason == KILL_REASON_KILLED)
	{
		var title1 = 'KILLED BY';
		var title2 = statLastKiller;
		title = title1+'<br>'+$("<div>").text(title2).html();
	}else
		title = "COLLIDED";

	$('#stat-title')[0].innerHTML = title;

	// LENGTH
	//console.log('Length: ' + statLength);
	$('#stat-length')[0].innerText = statLength;

	// KILL STREAK
	//console.log('Kill Streak: ' + statKillStreak);
	$('#stat-ks')[0].innerText = statKillStreak;

	// TOP POSITION
	//console.log('Top Position: ' + statTopPosition);
	$('#stat-top')[0].innerText = statTopPosition;

	// BEST LENGTH
	var bestLength = window.localStorage.bestLength;
	if(bestLength < statLength || bestLength == undefined)
	{
		bestLength = statLength
		window.localStorage.bestLength = statLength;
	}
	$('#stat-blength')[0].innerText = bestLength;
	//console.log('Best Length: ' + bestLength);

	// BEST KILL STREAK
	var bestKillStreak = window.localStorage.bestKillStreak;
	if(bestKillStreak < statKillStreak || bestKillStreak == undefined)
	{
		bestKillStreak = statKillStreak
		window.localStorage.bestKillStreak = bestKillStreak;
	}
	$('#stat-bks')[0].innerText = bestKillStreak;
	//console.log('Best Kill Streak: ' + bestKillStreak);

	// TIME ALIVE
	var statEndGame = +new Date();
	var deltaTime = (statEndGame - statBeginTime)/1000;
	if(deltaTime > 60.0)
	{
		var mins = Math.floor(deltaTime/60);
		var secs = (deltaTime-60*mins).toFixed(0);
		deltaTime = mins+'m '+secs+'s';
	}else{
		deltaTime = deltaTime.toFixed(1)+'s';
	}
	$('#stat-time')[0].innerText = deltaTime;
	//console.log('Time Alive: ' + deltaTime);

	statTopPosition = 0;
	statLength = 0;
	statKillStreak = 0;
}

function fadeinUINow()
{
	$('#overlay').fadeIn(500);
	refreshAd();
	if(focus){
		$('#nick').focus();
	}

	// Update Stats
	if(killCount >= KILLS_TO_FOLLOW && firstClick)
		updateStats();

	if(killCount < KILLS_TO_FOLLOW)
	{
		app.initSpeedupTutorial();
		app.fadeOutGame();
	}
}

function fadeinUI()
{
	UIVisible = true;
	if(!isInGame)
	{
		localPlayer = null;
	}

	setTimeout(fadeinUINow, 1000);
}

function resetCountdown()
{
	countDownBeginDate = +new Date();
}

function hideContinueScreen()
{
	$('#continueTop').hide();
	$('#continueBR').hide();
	$('#continue').hide();

	$('#nickInput').show();
	$('#skinPanel').hide();
	$('#howto').show();

	$('#beta').show();

	resetCountdown();
}

function updateTitle()
{
	objectCount = Object.keys(entities).length;
	if(objectCount > 0 && debug)
		document.title = gameName + ' (' + playerCount + ', ' + objectCount + ')';
	else
		document.title = gameName+'!';
}

function wasKilled()
{
	// Reset controls
	input.angle = Math.PI;
	input.throttle = 0;
	killCount++;
	killStreak = 0;
	window.localStorage.killCount = killCount;
	hud.fastHideTalkLayer();
}

function didFirstClick()
{
	//$('#firstRightBox').hide();
	//$('#afterRightBox').show();
}

function inIframe () {
    try {
        return window.self !== window.top;
    } catch (e) {
        return true;
    }
}

// Restore nickname if previously saved
if(window.localStorage.nick)
	$('#nick')[0].value = window.localStorage.nick;

var textTip1 = "GET CLOSE TO OTHER SNAKES TO BOOST";
var textTip2 = "CROSS OTHER PLAYERS";
var textTip3 = "EAT TO GROW";
var opacityVal = 0.0;
var tipTextID = 0;
var changeTip = false;
function showTip(tipID)
{
	nextTipID = tipID;
	changeTip = true;
}
setInterval(function(){
	if(!UIVisible)
		return;
	var tips = $('#tips')[0];
	var visibleVal = (1.0/4.0)*(Math.PI*2.0);
	opacityVal += 0.3;
	if(opacityVal > visibleVal && changeTip == false)
	{
		opacityVal = visibleVal;
	}
	var opacity = (Math.sin(opacityVal)+1.0)/2.0;

	if(opacityVal > (3.0/4.0)*(Math.PI*2.0)){
		/*tipTextID++;
		if(tipTextID > 2)
			tipTextID = 0;
		*/
		tipTextID = nextTipID;
		opacityVal = opacityVal - Math.PI*2.0;
		changeTip = false;

		var text;
		switch(tipTextID)
		{
			case 0:
				text = textTip1;
			break;
			case 1:
				text = textTip2;
			break;
			default:
				text = textTip3;
			break;
		}
		tips.innerHTML = text;
	}
	tips.style.opacity = Math.sqrt(opacity,5);
}, 50);
tips.innerHTML = textTip1;

function timedChangeTip()
{
	if(killCount >= KILLS_TO_FOLLOW && firstClick)
	{
		if(!darkenOverlay)
		{
			$('#overlay').css({ 'background-color': 'rgba(0,0,0,0.4)' });
			darkenOverlay = true;
		}

		tipTextID++;
		if(tipTextID > 2)
			tipTextID = 0;
		showTip(tipTextID);
	}
	setTimeout(timedChangeTip, 2500);
}
timedChangeTip();

function myConfirmation() {
	if(isInGame)
    	return 'Are you sure you want to quit?';
	else
		return;
}
window.onbeforeunload = myConfirmation;

document.oncontextmenu=function(){return false;};

window['toggleSound'] = function(){
	var imgPath = "images/sound_off.png";
	if(muteVolume == 1.0){
		muteVolume = 0.0;
		masterVolume = muteVolume;
		if(hud)
			hud.showTip('Sounds Disabled', 3000);
	}else if(muteVolume == 0.0){
		muteVolume = 1.0;
		masterVolume = 1.0;
		imgPath = "images/sound_on.png";
		if(hud)
			hud.showTip('Sounds Enabled', 3000);
	}
	window.localStorage.muteVol = muteVolume;
	$('#soundImg')[0].src = imgPath;
}

if(muteVolume == 0.0)
{
	muteVolume = 1.0;
	toggleSound();
}

// Ads
function refreshAd()
{
	if(debug || !showAds)
		return;

	if(adsense == null || !adsense)
	{
		$('#mpu-top').show();
		var ldrtop = $('#ldr-top');
		if(ldrtop)
			ldrtop.show();
		refreshSlots();
	}else{

		// CpmStar
		if(adShowCount == 0){
			cpmstarAPI({kind:"createmodule",module:"anchor79284", config:{"kind":"anchor", "options": { "dir": 1, "width": "1050px" }, request:{"poolid":"79284", kind:'banner'}}});
		}else{
			cpmstarAPI({kind:"adcmd", module:"anchor79284", command:"refresh"});
		}

		// Google Adsense
		if(!window['googletag']) return;
		window['googletag']['cmd']['push'](function(){

			if(!readyToRefreshAd)
				return;
			readyToRefreshAd = false;
			setTimeout(function(){
				readyToRefreshAd = true;
			}, refreshAdInterval * 60 * 1000);
			if(window['googletag'] && window['googletag']['pubads'] && window['googletag']['pubads']()['refresh']){
				window['googletag']['pubads']()['refresh'](window['ads']);
			}
		});
		adShowCount++;
	}
}

document.getElementById("overlay").onmousedown = function (e) {
    if(e.target == $('#nick')[0])
    {
    	return true;
    }
    return false; // Not needed, as long as you don't return false
};

fetch('./servers.json')
    .then((response) => response.json())
	.then((json) => {
		json.servers.forEach(server => {
			let serverTable = document.getElementsByClassName("server-table")[0]
			let tableBody = serverTable.getElementsByTagName("tbody")[0]
			let row = tableBody.insertRow()
			row.id = `server${server.id}`
			row.insertCell().innerText = server.name
			row.insertCell().innerText = `0/${server.maxPlayers}`
			row.insertCell().innerText = server.owner
			let buttonCell = row.insertCell()
			let button = document.createElement("button")
			button.type = "submit"
			button.innerText = "Join"
			button.classList.add("btn")
			button.classList.add("btn-play")
			button.classList.add("btn-primary")
			button.addEventListener('click', () => {
				selectServer(server.id)
			});
			buttonCell.appendChild(button)
				
		})
		serverListLoaded = true
		network.connect()
	});

refreshAd();

function loadScript(url){var head = document.getElementsByTagName('head')[0];var script = document.createElement('script');script.type = 'text/javascript';script.src = url;head.appendChild(script);}
loadScript("codenzi/Grid.js?v=1");
loadScript("codenzi/Utils.js?v=1");
loadScript("codenzi/Resources.js?v=1");
loadScript("codenzi/Input.js?v=1");
loadScript("codenzi/Effects.js?v=1");
loadScript("codenzi/Hud.js?v=1");
loadScript("codenzi/Snake.js?v=5");
loadScript("codenzi/Food.js?v=1");
loadScript("codenzi/Map.js?v=1");
loadScript("codenzi/Minimap.js?v=1");
loadScript("codenzi/Network.js?v=4");
loadScript("codenzi/App.js?v=2");
loadScript("codenzi/Camera.js?v=1");
loadScript("codenzi/Frame.js?v=1");
loadScript("codenzi/AnimationManager.js?v=1");
loadScript("codenzi/sheet.js?v=1");
loadScript("codenzi/Particle.js?v=1");
loadScript("codenzi/ParticleSystem.js?v=1");
loadScript("codenzi/Explosion.js?v=1");
loadScript("codenzi/SpeedupTutorial.js?v=1");
loadScript("codenzi/SoundManager.js?v=1");
loadScript("codenzi/TalkLayer.js?v=1");

window.onload = init;
