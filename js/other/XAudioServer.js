//2010-2012 Grant Galitz - XAudioJS realtime audio output compatibility library:
var XAudioJSscriptsHandle = document.getElementsByTagName("script");
var XAudioJSsourceOfWorker = XAudioJSscriptsHandle[XAudioJSscriptsHandle.length-1].src;
function XAudioServer(channels, sampleRate, minBufferSize, maxBufferSize, underRunCallback, volume, failureCallback) {
	XAudioJSChannelsAllocated = this.audioChannels = Math.max(channels, 1);
	XAudioJSSampleRate = Math.abs(sampleRate);
	XAudioJSMinBufferSize = (minBufferSize >= (XAudioJSSamplesPerCallback * this.audioChannels) && minBufferSize < maxBufferSize) ? (minBufferSize & (-this.audioChannels)) : (XAudioJSSamplesPerCallback * this.audioChannels);
	XAudioJSMaxBufferSize = (Math.floor(maxBufferSize) > XAudioJSMinBufferSize + this.audioChannels) ? (maxBufferSize & (-this.audioChannels)) : (XAudioJSMinBufferSize * this.audioChannels);
	this.underRunCallback = (typeof underRunCallback == "function") ? underRunCallback : function () {};
	XAudioJSVolume = (volume >= 0 && volume <= 1) ? volume : 1;
	this.failureCallback = (typeof failureCallback == "function") ? failureCallback : function () { throw(new Error("XAudioJS has encountered a fatal error.")); };
	this.initializeAudio();
}
XAudioServer.prototype.MOZWriteAudioNoCallback = function (buffer) {
	this.samplesAlreadyWritten += this.audioHandleMoz.mozWriteAudio(buffer);
}
XAudioServer.prototype.callbackBasedWriteAudioNoCallback = function (buffer) {
	//Callback-centered audio APIs:
	var length = buffer.length;
	for (var bufferCounter = 0; bufferCounter < length && XAudioJSAudioBufferSize < XAudioJSMaxBufferSize;) {
		XAudioJSAudioContextSampleBuffer[XAudioJSAudioBufferSize++] = buffer[bufferCounter++];
	}
}
/*Pass your samples into here!
Pack your samples as a one-dimenional array
With the channel samples packed uniformly.
examples:
    mono - [left, left, left, left]
    stereo - [left, right, left, right, left, right, left, right]
*/
XAudioServer.prototype.writeAudio = function (buffer) {
	switch (this.audioType) {
		case 0:
			this.MOZWriteAudioNoCallback(buffer);
			this.MOZExecuteCallback();
			break;
		case 2:
			this.checkFlashInit();
		case 1:
		case 3:
			this.callbackBasedWriteAudioNoCallback(buffer);
			this.callbackBasedExecuteCallback();
			break;
		default:
			this.failureCallback();
	}
}
/*Pass your samples into here if you don't want automatic callback calling:
Pack your samples as a one-dimenional array
With the channel samples packed uniformly.
examples:
    mono - [left, left, left, left]
    stereo - [left, right, left, right, left, right, left, right]
Useful in preventing infinite recursion issues with calling writeAudio inside your callback.
*/
XAudioServer.prototype.writeAudioNoCallback = function (buffer) {
	switch (this.audioType) {
		case 0:
			this.MOZWriteAudioNoCallback(buffer);
			break;
		case 2:
			this.checkFlashInit();
		case 1:
		case 3:
			this.callbackBasedWriteAudioNoCallback(buffer);
			break;
		default:
			this.failureCallback();
	}
}
//Developer can use this to see how many samples to write (example: minimum buffer allotment minus remaining samples left returned from this function to make sure maximum buffering is done...)
//If -1 is returned, then that means metric could not be done.
XAudioServer.prototype.remainingBuffer = function () {
	switch (this.audioType) {
		case 0:
			return this.samplesAlreadyWritten - this.audioHandleMoz.mozCurrentSampleOffset();
		case 2:
			this.checkFlashInit();
		case 1:
		case 3:
			return (Math.floor((resampledSamplesLeft() * XAudioJSResampleControl.ratioWeight) / this.audioChannels) * this.audioChannels) + XAudioJSAudioBufferSize;
		default:
			this.failureCallback();
			return null;
	}
}
XAudioServer.prototype.MOZExecuteCallback = function () {
	//mozAudio:
	var samplesRequested = XAudioJSMinBufferSize - this.remainingBuffer();
	if (samplesRequested > 0) {
		this.MOZWriteAudioNoCallback(this.underRunCallback(samplesRequested));
	}
}
XAudioServer.prototype.callbackBasedExecuteCallback = function () {
	//WebKit /Flash Audio:
	var samplesRequested = XAudioJSMinBufferSize - this.remainingBuffer();
	if (samplesRequested > 0) {
		this.callbackBasedWriteAudioNoCallback(this.underRunCallback(samplesRequested));
	}
}
//If you just want your callback called for any possible refill (Execution of callback is still conditional):
XAudioServer.prototype.executeCallback = function () {
	switch (this.audioType) {
		case 0:
			this.MOZExecuteCallback();
			break;
		case 2:
			this.checkFlashInit();
		case 1:
		case 3:
			this.callbackBasedExecuteCallback();
			break;
		default:
			this.failureCallback();
	}
}
//DO NOT CALL THIS, the lib calls this internally!
XAudioServer.prototype.initializeAudio = function () {
	try {
		this.initializeWebAudio();
	}
	catch (error) {
		try {
			this.initializeMozAudio();
		}
		catch (error) {
			try {
				this.initializeMediaStream();
			}
			catch (error) {
				try {
					this.initializeFlashAudio();
				}
				catch (error) {
					this.audioType = -1;
					this.failureCallback();
				}
			}
		}
	}
}
XAudioServer.prototype.initializeMediaStream = function () {
	this.audioHandleMediaStream = new Audio();
	this.resetCallbackAPIAudioBuffer(XAudioJSMediaStreamSampleRate);
	if (XAudioJSMediaStreamWorker) {
		//WebWorker is not GC'd, so manually collect it:
		XAudioJSMediaStreamWorker.terminate();
	}
	XAudioJSMediaStreamWorker = new Worker(XAudioJSsourceOfWorker.substring(0, XAudioJSsourceOfWorker.length - 3) + "MediaStreamWorker.js");
	this.audioHandleMediaStreamProcessing = new ProcessedMediaStream(XAudioJSMediaStreamWorker, XAudioJSMediaStreamSampleRate, this.audioChannels);
	this.audioHandleMediaStream.src = this.audioHandleMediaStreamProcessing;
	this.audioHandleMediaStream.volume = XAudioJSVolume;
	XAudioJSMediaStreamWorker.onmessage = XAudioJSMediaStreamPushAudio;
	XAudioJSMediaStreamWorker.postMessage([1, XAudioJSResampleBufferSize, this.audioChannels]);
	this.audioHandleMediaStream.play();
	this.audioType = 3;
}
XAudioServer.prototype.initializeMozAudio = function () {
	this.audioHandleMoz = new Audio();
	this.audioHandleMoz.mozSetup(this.audioChannels, XAudioJSSampleRate);
	this.audioHandleMoz.volume = XAudioJSVolume;
	this.samplesAlreadyWritten = 0;
	this.audioType = 0;
	if (navigator.platform != "MacIntel" && navigator.platform != "MacPPC") {
		//Add some additional buffering space to workaround a moz audio api issue:
		var bufferAmount = (XAudioJSSampleRate * this.audioChannels / 10) | 0;
		bufferAmount -= bufferAmount % this.audioChannels;
		this.samplesAlreadyWritten -= bufferAmount;
		
	}
}
XAudioServer.prototype.initializeWebAudio = function () {
	if (XAudioJSWebAudioLaunchedContext) {
		this.resetCallbackAPIAudioBuffer(XAudioJSWebAudioActualSampleRate);
		this.audioType = 1;
	}
	else {
		throw(new Error(""));
	}
}
XAudioServer.prototype.initializeFlashAudio = function () {
	var existingFlashload = document.getElementById("XAudioJS");
	this.flashInitialized = false;
	this.resetCallbackAPIAudioBuffer(44100);
	switch (this.audioChannels) {
		case 1:
			XAudioJSFlashTransportEncoder = generateFlashMonoString;
			break;
		case 2:
			XAudioJSFlashTransportEncoder = generateFlashStereoString;
			break;
		default:
			XAudioJSFlashTransportEncoder = generateFlashSurroundString;
	}
	if (existingFlashload == null) {
		this.audioHandleFlash = null;
		var thisObj = this;
		var mainContainerNode = document.createElement("div");
		mainContainerNode.setAttribute("style", "position: fixed; bottom: 0px; right: 0px; margin: 0px; padding: 0px; border: none; width: 8px; height: 8px; overflow: hidden; z-index: -1000; ");
		var containerNode = document.createElement("div");
		containerNode.setAttribute("style", "position: static; border: none; width: 0px; height: 0px; visibility: hidden; margin: 8px; padding: 0px;");
		containerNode.setAttribute("id", "XAudioJS");
		mainContainerNode.appendChild(containerNode);
		document.getElementsByTagName("body")[0].appendChild(mainContainerNode);
		swfobject.embedSWF(
			"XAudioJS.swf",
			"XAudioJS",
			"8",
			"8",
			"9.0.0",
			"",
			{},
			{"allowscriptaccess":"always"},
			{"style":"position: static; visibility: hidden; margin: 8px; padding: 0px; border: none"},
			function (event) {
				if (event.success) {
					thisObj.audioHandleFlash = event.ref;
					thisObj.checkFlashInit();
				}
				else {
					thisObj.failureCallback();
					thisObj.audioType = -1;
				}
			}
		);
	}
	else {
		this.audioHandleFlash = existingFlashload;
		this.checkFlashInit();
	}
	this.audioType = 2;
}
XAudioServer.prototype.changeVolume = function (newVolume) {
	if (newVolume >= 0 && newVolume <= 1) {
		XAudioJSVolume = newVolume;
		switch (this.audioType) {
			case 0:
				this.audioHandleMoz.volume = XAudioJSVolume;
			case 1:
				break;
			case 2:
				if (this.flashInitialized) {
					this.audioHandleFlash.changeVolume(XAudioJSVolume);
				}
				else {
					this.checkFlashInit();
				}
				break;
			case 3:
				this.audioHandleMediaStream.volume = XAudioJSVolume;
				break;
			default:
				this.failureCallback();
		}
	}
}
//Checks to see if the NPAPI Adobe Flash bridge is ready yet:
XAudioServer.prototype.checkFlashInit = function () {
	if (!this.flashInitialized) {
		try {
			if (this.audioHandleFlash && this.audioHandleFlash.initialize) {
				this.flashInitialized = true;
				this.audioHandleFlash.initialize(this.audioChannels, XAudioJSVolume);
			}
		}
		catch (error) {
			this.flashInitialized = false;
		}
	}
}
//Set up the resampling:
XAudioServer.prototype.resetCallbackAPIAudioBuffer = function (APISampleRate) {
	XAudioJSAudioContextSampleBuffer = getFloat32(XAudioJSMaxBufferSize);
	XAudioJSAudioBufferSize = XAudioJSResampleBufferEnd = XAudioJSResampleBufferStart = 0;
	XAudioJSResampleBufferSize = Math.max(XAudioJSMaxBufferSize * Math.ceil(APISampleRate / XAudioJSSampleRate) + XAudioJSChannelsAllocated, XAudioJSSamplesPerCallback * XAudioJSChannelsAllocated);
	XAudioJSResampleControl = new Resampler(XAudioJSSampleRate, APISampleRate, XAudioJSChannelsAllocated, XAudioJSResampleBufferSize, true);
	XAudioJSResampledBuffer = getFloat32(XAudioJSResampleBufferSize);
}
/////////END LIB
function getFloat32(size) {
	try {
		return new Float32Array(size);
	}
	catch (error) {
		return [];
	}
}
function XAudioJSFlashAudioEvent() {		//The callback that flash calls...
	resampleRefill();
	return XAudioJSFlashTransportEncoder();
}
function generateFlashSurroundString() {	//Convert the arrays to one long string for speed.
	var XAudioJSBinaryString = "";
	for (var index = 0; index < XAudioJSSamplesPerCallback && XAudioJSResampleBufferStart != XAudioJSResampleBufferEnd; ++index) {
		//Sanitize the buffer:
		XAudioJSBinaryString += String.fromCharCode(((Math.min(Math.max(XAudioJSResampledBuffer[XAudioJSResampleBufferStart++] + 1, 0), 2) * 0x3FFF) | 0) + 0x3000);
		XAudioJSBinaryString += String.fromCharCode(((Math.min(Math.max(XAudioJSResampledBuffer[XAudioJSResampleBufferStart++] + 1, 0), 2) * 0x3FFF) | 0) + 0x3000);
		XAudioJSResampleBufferStart += XAudioJSChannelsAllocated - 2;
		if (XAudioJSResampleBufferStart == XAudioJSResampleBufferSize) {
			XAudioJSResampleBufferStart = 0;
		}
	}
	return XAudioJSBinaryString;
}
function generateFlashStereoString() {	//Convert the arrays to one long string for speed.
	var XAudioJSBinaryString = "";
	for (var index = 0; index < XAudioJSSamplesPerCallback && XAudioJSResampleBufferStart != XAudioJSResampleBufferEnd; ++index) {
		//Sanitize the buffer:
		XAudioJSBinaryString += String.fromCharCode(((Math.min(Math.max(XAudioJSResampledBuffer[XAudioJSResampleBufferStart++] + 1, 0), 2) * 0x3FFF) | 0) + 0x3000);
		XAudioJSBinaryString += String.fromCharCode(((Math.min(Math.max(XAudioJSResampledBuffer[XAudioJSResampleBufferStart++] + 1, 0), 2) * 0x3FFF) | 0) + 0x3000);
		if (XAudioJSResampleBufferStart == XAudioJSResampleBufferSize) {
			XAudioJSResampleBufferStart = 0;
		}
	}
	return XAudioJSBinaryString;
}
function generateFlashMonoString() {	//Convert the array to one long string for speed.
	var XAudioJSBinaryString = "";
	for (var index = 0; index < XAudioJSSamplesPerCallback && XAudioJSResampleBufferStart != XAudioJSResampleBufferEnd; ++index) {
		//Sanitize the buffer:
		XAudioJSBinaryString += String.fromCharCode(((Math.min(Math.max(XAudioJSResampledBuffer[XAudioJSResampleBufferStart++] + 1, 0), 2) * 0x3FFF) | 0) + 0x3000);
		if (XAudioJSResampleBufferStart == XAudioJSResampleBufferSize) {
			XAudioJSResampleBufferStart = 0;
		}
	}
	return XAudioJSBinaryString;
}
//Some Required Globals:
var XAudioJSWebAudioContextHandle = null;
var XAudioJSWebAudioAudioNode = null;
var XAudioJSWebAudioAudioSource = null;
var XAudioJSWebAudioLaunchedContext = false;
var XAudioJSAudioContextSampleBuffer = [];
var XAudioJSResampledBuffer = [];
var XAudioJSMinBufferSize = 15000;
var XAudioJSMaxBufferSize = 25000;
var XAudioJSWebAudioActualSampleRate = 44100;
var XAudioJSSampleRate = 0;
var XAudioJSChannelsAllocated = 1;
var XAudioJSVolume = 1;
var XAudioJSResampleControl = null;
var XAudioJSAudioBufferSize = 0;
var XAudioJSResampleBufferStart = 0;
var XAudioJSResampleBufferEnd = 0;
var XAudioJSResampleBufferSize = 0;
var XAudioJSMediaStreamWorker = null;
var XAudioJSMediaStreamBuffer = [];
var XAudioJSMediaStreamSampleRate = 44100;
var XAudioJSSamplesPerCallback = 2048;			//Has to be between 2048 and 4096 (If over, then samples are ignored, if under then silence is added).
var XAudioJSFlashTransportEncoder = null;
var XAudioJSMediaStreamLengthAliasCounter = 0;
function audioOutputEvent(event) {		//Web Audio API callback...
	var index = 0;
	var buffer1 = event.outputBuffer.getChannelData(0);
	var buffer2 = event.outputBuffer.getChannelData(1);
	resampleRefill();
	switch (XAudioJSChannelsAllocated) {
		case 1:
			//MONO:
			while (index < XAudioJSSamplesPerCallback && XAudioJSResampleBufferStart != XAudioJSResampleBufferEnd) {
				buffer2[index] = buffer1[index] = XAudioJSResampledBuffer[XAudioJSResampleBufferStart++] * XAudioJSVolume;
				++index;
				if (XAudioJSResampleBufferStart == XAudioJSResampleBufferSize) {
					XAudioJSResampleBufferStart = 0;
				}
			}
			break;
		case 2:
			//STEREO:
			while (index < XAudioJSSamplesPerCallback && XAudioJSResampleBufferStart != XAudioJSResampleBufferEnd) {
				buffer1[index] = XAudioJSResampledBuffer[XAudioJSResampleBufferStart++] * XAudioJSVolume;
				buffer2[index++] = XAudioJSResampledBuffer[XAudioJSResampleBufferStart++] * XAudioJSVolume;
				if (XAudioJSResampleBufferStart == XAudioJSResampleBufferSize) {
					XAudioJSResampleBufferStart = 0;
				}
			}
			break;
		default:
			//SURROUND SOUND (Only output stereo, but handle surround right):
			while (index < XAudioJSSamplesPerCallback && XAudioJSResampleBufferStart != XAudioJSResampleBufferEnd) {
				buffer1[index] = XAudioJSResampledBuffer[XAudioJSResampleBufferStart++] * XAudioJSVolume;
				buffer2[index++] = XAudioJSResampledBuffer[XAudioJSResampleBufferStart++] * XAudioJSVolume;
				XAudioJSResampleBufferStart += XAudioJSChannelsAllocated - 2;
				if (XAudioJSResampleBufferStart == XAudioJSResampleBufferSize) {
					XAudioJSResampleBufferStart = 0;
				}
			}
	}
	//Pad with silence if we're underrunning:
	while (index < XAudioJSSamplesPerCallback) {
		buffer2[index] = buffer1[index] = 0;
		++index;
	}
}
//MediaStream API buffer push
function XAudioJSMediaStreamPushAudio(event) {
	var index = 0;
	var audioLengthRequested = event.data;
	var samplesPerCallbackAll = XAudioJSSamplesPerCallback * XAudioJSChannelsAllocated;
	var XAudioJSMediaStreamLengthAlias = audioLengthRequested % XAudioJSSamplesPerCallback;
	audioLengthRequested = audioLengthRequested - (XAudioJSMediaStreamLengthAliasCounter - (XAudioJSMediaStreamLengthAliasCounter % XAudioJSSamplesPerCallback)) - XAudioJSMediaStreamLengthAlias + XAudioJSSamplesPerCallback;
	XAudioJSMediaStreamLengthAliasCounter -= XAudioJSMediaStreamLengthAliasCounter - (XAudioJSMediaStreamLengthAliasCounter % XAudioJSSamplesPerCallback);
	XAudioJSMediaStreamLengthAliasCounter += XAudioJSSamplesPerCallback - XAudioJSMediaStreamLengthAlias;
	if (XAudioJSMediaStreamBuffer.length != samplesPerCallbackAll) {
		XAudioJSMediaStreamBuffer = new Float32Array(samplesPerCallbackAll);
	}
	resampleRefill();
	while (index < audioLengthRequested) {
		var index2 = 0;
		while (index2 < samplesPerCallbackAll && XAudioJSResampleBufferStart != XAudioJSResampleBufferEnd) {
			XAudioJSMediaStreamBuffer[index2++] = XAudioJSResampledBuffer[XAudioJSResampleBufferStart++];
			if (XAudioJSResampleBufferStart == XAudioJSResampleBufferSize) {
				XAudioJSResampleBufferStart = 0;
			}
		}
		XAudioJSMediaStreamWorker.postMessage([0, XAudioJSMediaStreamBuffer]);
		index += XAudioJSSamplesPerCallback;
	}
}
function resampleRefill() {
	if (XAudioJSAudioBufferSize > 0) {
		//Resample a chunk of audio:
		var resampleLength = XAudioJSResampleControl.resampler(getBufferSamples());
		var resampledResult = XAudioJSResampleControl.outputBuffer;
		for (var index2 = 0; index2 < resampleLength;) {
			XAudioJSResampledBuffer[XAudioJSResampleBufferEnd++] = resampledResult[index2++];
			if (XAudioJSResampleBufferEnd == XAudioJSResampleBufferSize) {
				XAudioJSResampleBufferEnd = 0;
			}
			if (XAudioJSResampleBufferStart == XAudioJSResampleBufferEnd) {
				XAudioJSResampleBufferStart += XAudioJSChannelsAllocated;
				if (XAudioJSResampleBufferStart == XAudioJSResampleBufferSize) {
					XAudioJSResampleBufferStart = 0;
				}
			}
		}
		XAudioJSAudioBufferSize = 0;
	}
}
function resampledSamplesLeft() {
	return ((XAudioJSResampleBufferStart <= XAudioJSResampleBufferEnd) ? 0 : XAudioJSResampleBufferSize) + XAudioJSResampleBufferEnd - XAudioJSResampleBufferStart;
}
function getBufferSamples() {
	//Typed array and normal array buffer section referencing:
	try {
		return XAudioJSAudioContextSampleBuffer.subarray(0, XAudioJSAudioBufferSize);
	}
	catch (error) {
		try {
			//Regular array pass:
			XAudioJSAudioContextSampleBuffer.length = XAudioJSAudioBufferSize;
			return XAudioJSAudioContextSampleBuffer;
		}
		catch (error) {
			//Nightly Firefox 4 used to have the subarray function named as slice:
			return XAudioJSAudioContextSampleBuffer.slice(0, XAudioJSAudioBufferSize);
		}
	}
}
//Initialize WebKit Audio:
(function () {
	if (!XAudioJSWebAudioLaunchedContext) {
		try {
			XAudioJSWebAudioContextHandle = new webkitAudioContext();							//Create a system audio context.
		}
		catch (error) {
			try {
				XAudioJSWebAudioContextHandle = new AudioContext();								//Create a system audio context.
			}
			catch (error) {
				return;
			}
		}
		try {
			XAudioJSWebAudioAudioSource = XAudioJSWebAudioContextHandle.createBufferSource();						//We need to create a false input to get the chain started.
			XAudioJSWebAudioAudioSource.loop = false;	//Keep this alive forever (Event handler will know when to ouput.)
			XAudioJSSampleRate = XAudioJSWebAudioActualSampleRate = XAudioJSWebAudioContextHandle.sampleRate;
			XAudioJSWebAudioAudioSource.buffer = XAudioJSWebAudioContextHandle.createBuffer(1, 1, XAudioJSWebAudioActualSampleRate);	//Create a zero'd input buffer for the input to be valid.
			XAudioJSWebAudioAudioNode = XAudioJSWebAudioContextHandle.createJavaScriptNode(XAudioJSSamplesPerCallback, 1, 2);			//Create 2 outputs and ignore the input buffer (Just copy buffer 1 over if mono)
			XAudioJSWebAudioAudioNode.onaudioprocess = audioOutputEvent;								//Connect the audio processing event to a handling function so we can manipulate output
			XAudioJSWebAudioAudioSource.connect(XAudioJSWebAudioAudioNode);												//Send and chain the input to the audio manipulation.
			XAudioJSWebAudioAudioNode.connect(XAudioJSWebAudioContextHandle.destination);							//Send and chain the output of the audio manipulation to the system audio output.
			XAudioJSWebAudioAudioSource.noteOn(0);														//Start the loop!
		}
		catch (error) {
			return;
		}
		XAudioJSWebAudioLaunchedContext = true;
	}
})();