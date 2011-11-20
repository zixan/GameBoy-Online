/*Initialize here first:
	Example:
		Stereo audio with a sample rate of 70 khz, a minimum buffer of 15000 samples total, a maximum buffer of 25000 samples total and a neutral amplitude value of -1.
			var parentObj = this;
			this.audioHandle = new XAudioServer(2, 70000, 15000, 25000, function (sampleCount) {
				return parentObj.audioUnderRun(sampleCount);
			}, -1);
	
	The callback is passed the number of samples requested, while it can return any number of samples it wants back.
*/
function XAudioServer(channels, sampleRate, minBufferSize, maxBufferSize, underRunCallback, defaultValue) {
	this.audioChannels = (channels == 2) ? 2 : 1;
	webAudioMono = (this.audioChannels == 1);
	XAudioJSSampleRate = (sampleRate >= 1 || sampleRate < 256000) ? sampleRate : 44100;
	webAudioMinBufferSize = (minBufferSize >= (Math.max(webAudioSamplesPerCallback, samplesPerCallback) << 1) && minBufferSize < maxBufferSize) ? (minBufferSize & ((webAudioMono) ? 0xFFFFFFFF : 0xFFFFFFFE)) : (Math.max(webAudioSamplesPerCallback, samplesPerCallback) << 1);
	webAudioMaxBufferSize = (Math.floor(maxBufferSize) > webAudioMinBufferSize + this.audioChannels) ? (maxBufferSize & ((webAudioMono) ? 0xFFFFFFFF : 0xFFFFFFFE)) : (minBufferSize << 1);
	this.underRunCallback = (typeof underRunCallback == "function") ? underRunCallback : function () {};
	defaultNeutralValue = (defaultValue >= -1 && defaultValue <= 1 && defaultValue != 0) ? defaultValue : 0;
	this.audioType = -1;
	this.mozAudioTail = [];
	this.audioHandleMoz = null;
	this.audioHandleFlash = null;
	this.audioHandleWAV = null;
	this.noWave = true;
	this.flashInitialized = false;
	this.mozAudioFound = false;
	this.initializeAudio();
}
XAudioServer.prototype.MOZWriteAudio = function (buffer) {
	//mozAudio:
	this.MOZWriteAudioNoCallback(buffer);
	var samplesRequested = webAudioMinBufferSize - this.remainingBuffer();
	if (samplesRequested > 0) {
		this.writeMozAudio(this.underRunCallback(samplesRequested));
	}
}
XAudioServer.prototype.MOZWriteAudioNoCallback = function (buffer) {
	//mozAudio:
	this.writeMozAudio(buffer);
}
XAudioServer.prototype.callbackBasedWriteAudio = function (buffer) {
	//Callback-centered audio APIs:
	this.callbackBasedWriteAudioNoCallback(buffer);
	//Execute our callback if underrunning:
	var samplesRequested = webAudioMinBufferSize - this.remainingBuffer();
	if (samplesRequested > 0) {
		buffer = this.underRunCallback(samplesRequested);
		samplesRequested = buffer.length;
		bufferCounter = 0;
		do {
			audioContextSampleBuffer[bufferEnd++] = buffer[bufferCounter++];
			if (bufferEnd == startPosition) {
				startPosition += this.audioChannels;
				if (webAudioMaxBufferSize <= startPosition) {
					startPosition -= webAudioMaxBufferSize;
				}
			}
			else if (bufferEnd == webAudioMaxBufferSize) {
				bufferEnd = 0;
			}
		} while (bufferCounter < samplesRequested);
	}
}
XAudioServer.prototype.callbackBasedWriteAudioNoCallback = function (buffer) {
	//Callback-centered audio APIs:
	var length = buffer.length;
	for (var bufferCounter = 0; bufferCounter < length;) {
		audioContextSampleBuffer[bufferEnd++] = buffer[bufferCounter++];
		if (bufferEnd == startPosition) {
			startPosition += this.audioChannels;
			if (webAudioMaxBufferSize <= startPosition) {
				startPosition -= webAudioMaxBufferSize;
			}
		}
		else if (bufferEnd == webAudioMaxBufferSize) {
			bufferEnd = 0;
		}
	}
}
XAudioServer.prototype.WAVWriteAudio = function (buffer) {
	//WAV PCM via Data URI:
	this.sampleCount += buffer.length;
	if (this.sampleCount >= webAudioMaxBufferSize) {
		var silenceLength = Math.round(this.audioChannels * XAudioJSSampleRate / 2);
		var silenceBuffer = new Array(silenceLength);
		for (var index = 0; index < silenceLength;) {
			silenceBuffer[index++] = defaultNeutralValue;
		}
		this.audioHandleWAV.appendBatch(silenceBuffer);	//Try to dampen the unavoidable clicking by padding with the set neutral.
		this.audioHandleWAV.outputAudio();
		this.audioHandleWAV = new AudioThread(this.audioChannels, XAudioJSSampleRate, 16, false);
		this.sampleCount -= webAudioMaxBufferSize;
	}
	this.audioHandleWAV.appendBatch(buffer);
}
/*Pass your samples into here!
Pack your samples as a one-dimenional array
With the channel samplea packed uniformly.
examples:
    mono - [left, left, left, left]
    stereo - [left, right, left, right, left, right, left, right]
*/
XAudioServer.prototype.writeAudio = function (buffer) {
	if (this.audioType == 0) {
		this.MOZWriteAudio(buffer);
	}
	else if (this.audioType == 1) {
		this.callbackBasedWriteAudio(buffer);
	}
	else if (this.audioType == 2) {
		this.WAVWriteAudio(buffer);
	}
	else if (this.audioType == 3) {
		if (this.checkFlashInit() || (webAudioEnabled && launchedContext)) {
			this.callbackBasedWriteAudio(buffer);
		}
		else if (this.mozAudioFound) {
			this.MOZWriteAudio(buffer);
		}
		else if (!this.noWave) {
			this.WAVWriteAudio(buffer);
		}
	}
}
/*Pass your samples into here if you don't want automatic callback calling:
Pack your samples as a one-dimenional array
With the channel samplea packed uniformly.
examples:
    mono - [left, left, left, left]
    stereo - [left, right, left, right, left, right, left, right]
Useful in preventing infinite recursion issues with calling writeAudio inside your callback.
*/
XAudioServer.prototype.writeAudioNoCallback = function (buffer) {
	if (this.audioType == 0) {
		this.MOZWriteAudioNoCallback(buffer);
	}
	else if (this.audioType == 1) {
		this.callbackBasedWriteAudioNoCallback(buffer);
	}
	else if (this.audioType == 2) {
		this.WAVWriteAudio(buffer);
	}
	else if (this.audioType == 3) {
		if (this.checkFlashInit() || (webAudioEnabled && launchedContext)) {
			this.callbackBasedWriteAudioNoCallback(buffer);
		}
		else if (this.mozAudioFound) {
			this.MOZWriteAudioNoCallback(buffer);
		}
		else if (!this.noWave) {
			this.WAVWriteAudio(buffer);
		}
	}
}
//Developer can use this to see how many samples to write (example: minimum buffer allotment minus remaining samples left returned from this function to make sure maximum buffering is done...)
//If -1 is returned, then that means metric could not be done.
XAudioServer.prototype.remainingBuffer = function () {
	if (this.audioType == 0) {
		//mozAudio:
		return this.samplesAlreadyWritten - this.audioHandleMoz.mozCurrentSampleOffset();
	}
	else if (this.audioType == 1) {
		//WebKit Audio:
		return ((startPosition > bufferEnd) ? (webAudioMaxBufferSize - startPosition + bufferEnd) : (bufferEnd - startPosition));
	}
	else if (this.audioType == 3) {
		if (this.checkFlashInit() || (webAudioEnabled && launchedContext)) {
			//Webkit Audio / Flash Plugin Audio:
			return ((startPosition > bufferEnd) ? (webAudioMaxBufferSize - startPosition + bufferEnd) : (bufferEnd - startPosition));
		}
		else if (this.mozAudioFound) {
			//mozAudio:
			return this.samplesAlreadyWritten - this.audioHandleMoz.mozCurrentSampleOffset();
		}
		else {
			//WAV PCM via Data URI:
			return -1;
		}
	}
	else {
		//WAV PCM via Data URI:
		return -1;	//Impossible to do this metric.
	}
}
XAudioServer.prototype.mozExecuteCallback = function () {
	//mozAudio:
	var samplesRequested = webAudioMinBufferSize - this.remainingBuffer();
	if (samplesRequested > 0) {
		this.writeMozAudio(this.underRunCallback(samplesRequested));
	}
}
XAudioServer.prototype.webAudioExecuteCallback = function () {
	//WebKit /Flash Audio:
	var samplesRequested = webAudioMinBufferSize - this.remainingBuffer();
	if (samplesRequested > 0) {
		var buffer = this.underRunCallback(samplesRequested);
		samplesRequested = buffer.length;
		for (var bufferCounter = 0; bufferCounter < samplesRequested;) {
			audioContextSampleBuffer[bufferEnd++] = buffer[bufferCounter++];
			if (bufferEnd == startPosition) {
				startPosition += this.audioChannels;
				if (webAudioMaxBufferSize <= startPosition) {
					startPosition -= webAudioMaxBufferSize;
				}
			}
			else if (bufferEnd == webAudioMaxBufferSize) {
				bufferEnd = 0;
			}
		}
	}
}
XAudioServer.prototype.WAVExecuteCallback = function () {
	//WAV PCM via Data URI:
	if (this.sampleCount > 0) {
		//Output the audio immediately, since we can't utilize the callback...
		this.audioHandleWAV.outputAudio();
		this.audioHandleWAV = new AudioThread(this.audioChannels, XAudioJSSampleRate, 16, false);
		this.sampleCount = 0;
	}
}
//If you just want your callback called for any possible refill (Execution of callback is still conditional):
XAudioServer.prototype.executeCallback = function () {
	if (this.audioType == 0) {
		this.mozExecuteCallback();
	}
	else if (this.audioType == 1) {
		this.webAudioExecuteCallback();
	}
	else if (this.audioType == 3) {
		if (this.checkFlashInit() || (webAudioEnabled && launchedContext)) {
			this.webAudioExecuteCallback();
		}
		else if (this.mozAudioFound) {
			this.mozExecuteCallback();
		}
		else if (!this.noWave) {
			this.WAVExecuteCallback();
		}
	}
	else if (this.audioType == 2) {
		this.WAVExecuteCallback();
	}
}
//DO NOT CALL THIS, the lib calls this internally!
XAudioServer.prototype.initializeAudio = function () {
	try {
		this.preInitializeMozAudio();
		if (navigator.platform == "Linux i686") {
			//Block out mozaudio usage for Linux Firefox due to moz bugs:
			throw(new Error(""));
		}
		this.initializeMozAudio();
	}
	catch (error) {
		try {
			this.initializeWebAudio();
		}
		catch (error) {
			try {
				this.initializeFlashAudio();
			}
			catch (error) {
				try {
					webAudioEnabled = true;	//If we banned web audio, but flash support errored, then un-ban it.
					this.initializeWebAudio();
				}
				catch (error) {
					webAudioEnabled = false;
					if (this.noWave) {
						throw(new Error("Browser does not support real time audio output."));
					}
				}
			}
		}
	}
}
XAudioServer.prototype.preInitializeMozAudio = function () {
	//mozAudio - Synchronous Audio API
	this.audioHandleMoz = new Audio();
	this.audioHandleMoz.mozSetup(this.audioChannels, XAudioJSSampleRate);
	this.samplesAlreadyWritten = 0;
	var emptySampleFrame = (this.audioChannels == 2) ? [0, 0] : [0];
	var prebufferAmount = 0;
	if (navigator.platform != "MacIntel" && navigator.platform != "MacPPC") {	//Mac OS X doesn't experience this moz-bug!
		while (this.audioHandleMoz.mozCurrentSampleOffset() == 0) {
			//Mozilla Audio Bugginess Workaround (Firefox freaks out if we don't give it a prebuffer under certain OSes):
			prebufferAmount += this.audioHandleMoz.mozWriteAudio(emptySampleFrame);
		}
		var samplesToDoubleBuffer = prebufferAmount / this.audioChannels;
		//Double the prebuffering for windows:
		for (var index = 0; index < samplesToDoubleBuffer; index++) {
			this.samplesAlreadyWritten += this.audioHandleMoz.mozWriteAudio(emptySampleFrame);
		}
	}
	this.samplesAlreadyWritten += prebufferAmount;
	webAudioMinBufferSize += this.samplesAlreadyWritten;
	this.mozAudioFound = true;
}
XAudioServer.prototype.initializeMozAudio = function () {
	//Fill in our own buffering up to the minimum specified:
	this.writeMozAudio(getFloat32(webAudioMinBufferSize));
	this.audioType = 0;
}
XAudioServer.prototype.initializeWebAudio = function () {
	if (webAudioEnabled && launchedContext) {
		resetCallbackAPIAudioBuffer(webAudioActualSampleRate, webAudioSamplesPerCallback);
		if (navigator.platform != "MacIntel" && navigator.platform != "MacPPC") {
			//Google Chrome has a critical bug that they haven't patched for half a year yet, so I'm blacklisting the OSes affected.
			throw(new Error(""));
		}
		this.audioType = 1;
	}
	else {
		throw(new Error(""));
	}
}
XAudioServer.prototype.initializeFlashAudio = function () {
	if (!webAudioEnabled || !launchedContext) {
		//Web Audio was not found, so we're resetting some settings for flash:
		resetCallbackAPIAudioBuffer(44100, samplesPerCallback);
	}
	this.initializeWAVAudio();
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
				if (webAudioEnabled && launchedContext) {
					webAudioEnabled = false;
					resetResamplingConfigs(44100, samplesPerCallback);
				}
			}
			else if (launchedContext) {
				if (webAudioEnabled) {
					thisObj.audioType = 1;
				}
				else {
					try {
						//If we banned web audio, but flash support errored, then un-ban it:
						webAudioEnabled = true;
						resetResamplingConfigs(webAudioActualSampleRate, webAudioSamplesPerCallback);
						thisObj.initializeWebAudio();
					}
					catch (error) {
						//Re-ban if failed:
						webAudioEnabled = false;
						thisObj.audioType = 2;
					}
				}
			}
			else if (thisObj.mozAudioFound) {
				//If Flash failed and on Linux Firefox, try MozAudio even though it's buggy (Still better than WAV):
				thisObj.initializeMozAudio();
			}
		}
	);
	this.audioType = 3;
}
XAudioServer.prototype.initializeWAVAudio = function () {
	try {
		this.audioHandleWAV = new AudioThread(this.audioChannels, XAudioJSSampleRate, 16, false);
		this.audioType = 2;
		this.sampleCount = 0;
		this.noWave = false;
	}
	catch (error) {
		this.noWave = true;
	}
}
//Moz Audio Buffer Writing Handler:
XAudioServer.prototype.writeMozAudio = function (buffer) {
	var length = this.mozAudioTail.length;
	if (length > 0) {
		var samplesAccepted = this.audioHandleMoz.mozWriteAudio(this.mozAudioTail);
		this.samplesAlreadyWritten += samplesAccepted;
		this.mozAudioTail.splice(0, samplesAccepted);
	}
	length = Math.min(buffer.length, webAudioMaxBufferSize - this.samplesAlreadyWritten + this.audioHandleMoz.mozCurrentSampleOffset());
	var samplesAccepted = this.audioHandleMoz.mozWriteAudio(buffer);
	this.samplesAlreadyWritten += samplesAccepted;
	for (var index = 0; length > samplesAccepted; --length) {
		//Moz Audio wants us saving the tail:
		this.mozAudioTail.push(buffer[index++]);
	}
}
//Checks to see if the NPAPI Adobe Flash bridge is ready yet:
XAudioServer.prototype.checkFlashInit = function () {
	if (!this.flashInitialized && this.audioHandleFlash && this.audioHandleFlash.initialize) {
		this.flashInitialized = true;
		this.audioHandleFlash.initialize(this.audioChannels, defaultNeutralValue);
	}
	return this.flashInitialized;
}
/////////END LIB
function getFloat32(size) {
	try {
		var newBuffer = new Float32Array(size);
	}
	catch (error) {
		var newBuffer = new Array(size);
	}
	for (var audioSampleIndice = 0; audioSampleIndice < size; ++audioSampleIndice) {
		//Create a gradual neutral position shift here to make sure we don't cause annoying clicking noises
		//when the developer set neutral position is not 0.
		newBuffer[audioSampleIndice] = defaultNeutralValue * (audioSampleIndice / size);
	}
	return newBuffer;
}
function getFloat32Flat(size) {
	try {
		var newBuffer = new Float32Array(size);
	}
	catch (error) {
		var newBuffer = new Array(size);
		var audioSampleIndice = 0;
		do {
			newBuffer[audioSampleIndice] = 0;
		} while (++audioSampleIndice < size);
	}
	return newBuffer;
}
//Flash NPAPI Event Handler:
var samplesPerCallback = 2500;			//Has to be between 2048 and 4096 (If over, then samples are ignored, if under then silence is added).
var outputConvert = null;
function audioOutputFlashEvent() {		//The callback that flash calls...
	if (startPosition != bufferEnd) {
		//Resample a chunk of audio:
		resampler(samplesPerCallback);
		return outputConvert();
	}
	return "";
}
function generateFlashStereoString() {	//Convert the arrays to one long string for speed.
	//Make sure we send an array and not a typed array!
	var copyBinaryString = "";
	for (var index = 0; index < samplesFound; ++index) {
		//Sanitize the buffer:
		copyBinaryString += String.fromCharCode(((Math.min(Math.max(resampleChannel1Buffer[index] + 1, 0), 2) * 0x3FFF) | 0) + 0x3000);
	}
	for (index = 0; index < samplesFound; ++index) {
		//Sanitize the buffer:
		copyBinaryString += String.fromCharCode(((Math.min(Math.max(resampleChannel2Buffer[index] + 1, 0), 2) * 0x3FFF) | 0) + 0x3000);
	}
	return copyBinaryString;
}
function generateFlashMonoString() {	//Convert the array to one long string for speed.
	//Make sure we send an array and not a typed array!
	var copyBinaryString = "";
	for (var index = 0; index < samplesFound; ++index) {
		//Sanitize the buffer:
		copyBinaryString += String.fromCharCode(((Math.min(Math.max(resampleChannel1Buffer[index] + 1, 0), 2) * 0x3FFF) | 0) + 0x3000);
	}
	return copyBinaryString;
}
//Audio API Event Handler:
var audioContextHandle = null;
var audioNode = null;
var audioSource = null;
var launchedContext = false;
var webAudioEnabled = false;		//Disable until the Google Chrome Team fixes their bugs.
var webAudioSamplesPerCallback = 1024;
var startPosition = 0;
var bufferEnd = 0;
var audioContextSampleBuffer = [];
var webAudioMinBufferSize = 15000;
var webAudioMaxBufferSize = 25000;
var webAudioActualSampleRate = 44100;
var XAudioJSSampleRate = 0;
var webAudioMono = false;
var sampleBase1 = 0;
var sampleBase2 = 0;
var startPositionOverflow = 0;
var resampleAmountFloor = 0;
var resampleAmountRemainder = 0;
var resampleAmount = 0;
var defaultNeutralValue = 0;
var resampler = null;
var samplesFound = 0;
var resampleChannel1Buffer = [];
var resampleChannel2Buffer = [];
function audioOutputEvent(event) {		//Web Audio API callback...
	if (webAudioEnabled) {
		var index = 0;
		var buffer1 = event.outputBuffer.getChannelData(0);
		var buffer2 = event.outputBuffer.getChannelData(1);
		if (startPosition != bufferEnd) {
			//Resample a chunk of audio:
			resampler(webAudioSamplesPerCallback);
			if (!webAudioMono) {
				//STEREO:
				while (index < samplesFound) {
					buffer1[index] = resampleChannel1Buffer[index];
					buffer2[index] = resampleChannel2Buffer[index];
					++index;
				}
			}
			else {
				//MONO:
				while (index < samplesFound) {
					buffer2[index] = buffer1[index] = resampleChannel1Buffer[index];
					++index;
				}
			}
		}
		//Pad with silence if we're underrunning:
		while (index < webAudioSamplesPerCallback) {
			buffer2[index] = buffer1[index] = defaultNeutralValue;
			++index;
		}
	}
}
function downsamplerMono(numberOfSamples) {
	//MONO:
	for (samplesFound = 0; samplesFound < numberOfSamples && startPosition != bufferEnd;) {
		sampleBase1 = audioContextSampleBuffer[startPosition++];
		if (startPosition == bufferEnd) {
			//Resampling must be clipped here:
			resampleChannel1Buffer[samplesFound++] = sampleBase1;
			return;
		}
		if (startPosition == webAudioMaxBufferSize) {
			startPosition = 0;
		}
		for (var sampleIndice = 1; sampleIndice < resampleAmountFloor;) {
			++sampleIndice;
			sampleBase1 += audioContextSampleBuffer[startPosition++];
			if (startPosition == bufferEnd) {
				//Resampling must be clipped here:
				resampleChannel1Buffer[samplesFound++] = sampleBase1 / sampleIndice;
				return;
			}
			if (startPosition == webAudioMaxBufferSize) {
				startPosition = 0;
			}
		}
		startPositionOverflow += resampleAmountRemainder;
		if (startPositionOverflow >= 1) {
			--startPositionOverflow;
			sampleBase1 += audioContextSampleBuffer[startPosition++];
			if (startPosition == webAudioMaxBufferSize) {
				startPosition = 0;
			}
			++sampleIndice;
		}
		resampleChannel1Buffer[samplesFound++] = sampleBase1 / sampleIndice;
	}
}
function downsamplerStereo(numberOfSamples) {
	//STEREO:
	for (samplesFound = 0; samplesFound < numberOfSamples && startPosition != bufferEnd;) {
		sampleBase1 = audioContextSampleBuffer[startPosition++];
		sampleBase2 = audioContextSampleBuffer[startPosition++];
		if (startPosition == bufferEnd) {
			//Resampling must be clipped here:
			resampleChannel1Buffer[samplesFound] = sampleBase1;
			resampleChannel2Buffer[samplesFound++] = sampleBase2;
			return;
		}
		if (startPosition == webAudioMaxBufferSize) {
			startPosition = 0;
		}
		for (var sampleIndice = 1; sampleIndice < resampleAmountFloor;) {
			++sampleIndice;
			sampleBase1 += audioContextSampleBuffer[startPosition++];
			sampleBase2 += audioContextSampleBuffer[startPosition++];
			if (startPosition == bufferEnd) {
				//Resampling must be clipped here:
				resampleChannel1Buffer[samplesFound] = sampleBase1 / sampleIndice;
				resampleChannel2Buffer[samplesFound++] = sampleBase2 / sampleIndice;
				return;
			}
			if (startPosition == webAudioMaxBufferSize) {
				startPosition = 0;
			}
		}
		startPositionOverflow += resampleAmountRemainder;
		if (startPositionOverflow >= 1) {
			--startPositionOverflow;
			sampleBase1 += audioContextSampleBuffer[startPosition++];
			sampleBase2 += audioContextSampleBuffer[startPosition++];
			if (startPosition == webAudioMaxBufferSize) {
				startPosition = 0;
			}
			++sampleIndice;
		}
		resampleChannel1Buffer[samplesFound] = sampleBase1 / sampleIndice;
		resampleChannel2Buffer[samplesFound++] = sampleBase2 / sampleIndice;
	}
}
function upsamplerMono(numberOfSamples) {
	//MONO:
	for (samplesFound = 0; samplesFound < numberOfSamples && startPosition != bufferEnd;) {
		resampleChannel1Buffer[samplesFound++] = audioContextSampleBuffer[startPosition];
		startPositionOverflow += resampleAmount;
		if (startPositionOverflow >= 1) {
			--startPositionOverflow;
			++startPosition;
			if (startPosition == webAudioMaxBufferSize) {
				startPosition = 0;
			}
		}
	}
}
function upsamplerStereo(numberOfSamples) {
	//STEREO:
	for (samplesFound = 0; samplesFound < numberOfSamples && startPosition != bufferEnd;) {
		resampleChannel1Buffer[samplesFound] = audioContextSampleBuffer[startPosition];
		resampleChannel2Buffer[samplesFound++] = audioContextSampleBuffer[startPosition + 1];
		startPositionOverflow += resampleAmount;
		if (startPositionOverflow >= 1) {
			--startPositionOverflow;
			startPosition += 2;
			if (startPosition == webAudioMaxBufferSize) {
				startPosition = 0;
			}
		}
	}
}
function noresampleMono(numberOfSamples) {
	//MONO:
	for (samplesFound = 0; samplesFound < numberOfSamples && startPosition != bufferEnd;) {
		resampleChannel1Buffer[samplesFound++] = audioContextSampleBuffer[startPosition++];
		if (startPosition == webAudioMaxBufferSize) {
			startPosition = 0;
		}
	}
}
function noresampleStereo(numberOfSamples) {
	//STEREO:
	for (samplesFound = 0; samplesFound < numberOfSamples && startPosition != bufferEnd;) {
		resampleChannel1Buffer[samplesFound] = audioContextSampleBuffer[startPosition++];
		resampleChannel2Buffer[samplesFound++] = audioContextSampleBuffer[startPosition++];
		if (startPosition == webAudioMaxBufferSize) {
			startPosition = 0;
		}
	}
}
//Initialize WebKit Audio /Flash Audio Buffer:
function resetCallbackAPIAudioBuffer(APISampleRate, bufferAlloc) {
	//Set up the resampling and buffering variables:
	resetResamplingConfigs(APISampleRate, bufferAlloc);
	audioContextSampleBuffer = getFloat32(webAudioMaxBufferSize);
	startPosition = 0;
	bufferEnd = webAudioMinBufferSize;
	if (webAudioMono) {
		//MONO Handling:
		if (webAudioActualSampleRate < XAudioJSSampleRate) {
			resampler = downsamplerMono;
		}
		else if (webAudioActualSampleRate > XAudioJSSampleRate) {
			resampler = upsamplerMono;
		}
		else {
			resampler = noresampleMono;
		}
		outputConvert = generateFlashMonoString;
	}
	else {
		//STEREO Handling:
		if (webAudioActualSampleRate < XAudioJSSampleRate) {
			resampler = downsamplerStereo;
		}
		else if (webAudioActualSampleRate > XAudioJSSampleRate) {
			resampler = upsamplerStereo;
		}
		else {
			resampler = noresampleStereo;
		}
		outputConvert = generateFlashStereoString;
	}
}
function resetResamplingConfigs(APISampleRate, bufferAlloc) {
	//Reset the resampling:
	var resampleAmountTemp = XAudioJSSampleRate / APISampleRate;
	if (resampleAmountTemp != resampleAmount) {
		resampleAmount = resampleAmountTemp;
		resampleAmountFloor = resampleAmount | 0;
		resampleAmountRemainder = resampleAmount - resampleAmountFloor;
		startPositionOverflow = 0;
		resampleChannel1Buffer = getFloat32Flat(bufferAlloc);
		resampleChannel2Buffer = getFloat32Flat(bufferAlloc);
	}
}
//Initialize WebKit Audio:
(function () {
	if (!launchedContext) {
		try {
			audioContextHandle = new webkitAudioContext();							//Create a system audio context.
		}
		catch (error) {
			try {
				audioContextHandle = new AudioContext();								//Create a system audio context.
			}
			catch (error) {
				return;
			}
		}
		try {
			audioSource = audioContextHandle.createBufferSource();						//We need to create a false input to get the chain started.
			audioSource.loop = false;	//Keep this alive forever (Event handler will know when to ouput.)
			XAudioJSSampleRate = webAudioActualSampleRate = audioContextHandle.sampleRate;
			audioSource.buffer = audioContextHandle.createBuffer(1, 1, webAudioActualSampleRate);	//Create a zero'd input buffer for the input to be valid.
			audioNode = audioContextHandle.createJavaScriptNode(webAudioSamplesPerCallback, 1, 2);	//Create 2 outputs and ignore the input buffer (Just copy buffer 1 over if mono)
			audioNode.onaudioprocess = audioOutputEvent;								//Connect the audio processing event to a handling function so we can manipulate output
			audioSource.connect(audioNode);												//Send and chain the input to the audio manipulation.
			audioNode.connect(audioContextHandle.destination);							//Send and chain the output of the audio manipulation to the system audio output.
			audioSource.noteOn(0);														//Start the loop!
		}
		catch (error) {
			return;
		}
		launchedContext = true;
	}
})();