var audioHandle = null;
var canvasDOM = null;
var drawContext = null;
var vblankEvent = null;
var decodeHandle = null;
var position = 0;
function audioCheck(numberOfSamplesToGet) {
	var samples = [];
	numberOfSamplesToGet = Math.min(numberOfSamplesToGet, decodeHandle.song.length - position);
	if (numberOfSamplesToGet > 0) {
		numberOfSamplesToGet += position;
		samples = decodeHandle.slice(position, numberOfSamplesToGet);
		position = numberOfSamplesToGet;
		drawSamples(samples);
	}
	return samples;
}
function drawSamples(samples) {
	var sample = 0;
	var index2 = 0;
	var index3 = 0;
	if (decodeHandle.channels == 1) {
		//MONO:
		var length = Math.min(samples.length, 300);
		canvasDOM.width = length;
		for (var index = 0; index < length; ++index) {
			sample = Math.round(Math.min(Math.max((samples[index] * 128) + 127.5, 0), 255));
			drawContext.fillStyle = "rgb(0, 0, " + sample + ")";
			drawContext.fillRect(index, 0, 1, 256);
			for (index2 = 1, index3 = 0; index2 < 5; ++index2) {
				drawContext.fillStyle = "rgb(" + ((255 / index2) | 0) + ", 0, 0)";
				drawContext.fillRect(index, 255 - sample + index3, 1, index2);
				index3 += index2;
			}
		}
	}
	else {
		//STEREO:
		var length = Math.min(samples.length, 600);
		canvasDOM.width = length >> 1;
		for (var index = 0; index < length; index += 2) {
			sample = Math.round(Math.min(Math.max(((samples[index] + samples[index | 1]) * 64) + 127.5, 0), 255));
			drawContext.fillStyle = "rgb(0, 0, " + sample + ")";
			drawContext.fillRect(index >> 1, 0, 1, 256);
			for (index2 = 1, index3 = 0; index2 < 5; ++index2) {
				drawContext.fillStyle = "rgb(" + ((255 / index2) | 0) + ", 0, 0)";
				drawContext.fillRect(index >> 1, 255 - sample + index3, 1, index2);
				index3 += index2;
			}
		}
	}
}
function initializeCanvas() {
	canvasDOM = document.getElementById("music");
	drawContext = canvasDOM.getContext("2d");
	var textLoad = document.getElementById("loading");
	textLoad.parentNode.removeChild(textLoad);
}
function startAudio(song_raw) {
	try {
		initializeCanvas();
		decodeHandle = new Decoder(song_raw);
		audioHandle = new XAudioServer(decodeHandle.channels, decodeHandle.sampleRate, decodeHandle.sampleRate >> 2, decodeHandle.sampleRate << 1, audioCheck, 0);
		if (!vblankEvent) {
			vblankEvent = window.requestAnimationFrame || 
				window.webkitRequestAnimationFrame || 
				window.mozRequestAnimationFrame || 
				window.oRequestAnimationFrame || 
				window.msRequestAnimationFrame ||
				function (dummy1, dummy2) { setTimeout(VBlankSyncHandler, 20); };
			vblankEvent(VBlankSyncHandler, canvasDOM);
		}
	}
	catch (e) {
		alert(e.message);
	}
}
function downloadAudio() {
	new Ajax({
		URL:"music/dance.wav",
		Accept:"BINARY",
		Cached:true,
		Timeout:200,
		ORDER:[0,1],
		Fail:function (error_message) {
			alert("Your browser could not handle this demo.");
		},
		Complete:function (data1, data2) {
			startAudio(data2);
		}
	});
}
function VBlankSyncHandler() {
	audioHandle.executeCallback();
	vblankEvent(VBlankSyncHandler, canvasDOM);
}
document.addEventListener("DOMContentLoaded", downloadAudio, false);