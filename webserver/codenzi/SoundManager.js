var SOUND_CRASH             = 'crash';
var SOUND_SPARK             = 'spark';
var SOUND_ELECTRO_LOOP      = 'electroloop';
var SOUND_LINE_LOOP         = 'lineloop';
var SOUND_LINE_FAST_LOOP    = 'lineloopfast';
var SOUND_FOOD_GRAB         = 'foodgrab';
var SOUND_TURN              = 'turn';

var SOUND_NO_SOUND			= '';
var PLAY_RULE_ALWAYSPLAY	= 0;
var PLAY_RULE_MAX3			= 3;

// Mixer
var VOLUME_CRASH			= 0.2;
var VOLUME_SPARK			= 0.6;
var VOLUME_ELECTRO_LOOP		= 1.0;
var VOLUME_LINE_LOOP_MIN 	= 0.05;
var VOLUME_LINE_LOOP_MAX	= 0.8;
var VOLUME_LINE_FAST_LOOP 	= 1.4;
var VOLUME_FOOD_GRAB 		= 0.3;
var VOLUME_TURN				= 0.6;

var SoundManager = function() {

	this.sound;
	var loaded = false;
	var lastVolume = 1.0;

	var playingSounds = {};

	var sprite = {
    "crash": [
      0,
      804.0589569160998
    ],
    "electroloop": [
      2000,
      1821.1791383219954,
      1
    ],
    "foodgrab": [
      5000,
      461.29251700680294
    ],
    "lineloop": [
      7000,
      2946.1224489795923,
      1
    ],
    "lineloopfast": [
      11000,
      2000,
      1
    ],
    "spark": [
      14000,
      87.93650793650798
    ],
    "turn": [
      16000,
      500
    ]
  };

	this.load = function(cb) {
		this.sound = new Howl({
			"urls": [
				"sounds/out.ogg",
				"sounds/out.m4a",
				"sounds/out.mp3",
				"sounds/out.ac3"
			],
			"sprite": sprite,
			onload: function() {
    			loaded = true;
    			if(cb)
    				cb();
  			}
		});
	};

	this.playSound = function(soundID, volume, pitch, playRule, cb) {
		if(!loaded || !focus)
			return;

		volume = volume*masterVolume;
		if(!firstClick){ // No sound before first play
			volume = 0;
		}else if(UIVisible){
			volume = volume * 0.3;
		}

		var soundCount = playingSounds[soundID];
		var soundInfo = sprite[soundID];

		if(!soundCount)
			playingSounds[soundID] = 0;
		
		var maxPlayingSounds = playRule;
		if(maxPlayingSounds > 0){
			if(playingSounds[soundID] >= maxPlayingSounds)
				return;
		}

		this.sound.play(soundID, function(a){
			var node = soundManager.sound._nodeById(a);
			if(node && node.bufferSource)
				node.bufferSource.playbackRate.value = pitch;
			soundManager.sound.volume(volume, a);
			if(cb)
				cb(a);
		});

		var duration = soundInfo[1];
		if(playRule != PLAY_RULE_ALWAYSPLAY)
			playingSounds[soundID]++;

		setTimeout(function(){
			if(playRule != PLAY_RULE_ALWAYSPLAY)
				playingSounds[soundID]--;
		}, duration);
	}

	this.stop = function(soundInstance)
	{
		if(!loaded)
			return;

		soundInstance.stop();
	}

	this.setVolume = function(volume)
	{
		lastVolume = volume;
		this.sound.volume(volume);
	}
}