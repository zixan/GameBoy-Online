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
	this.audioChannels = (channels >= 1) ? ((channels > 3) ? 2 : Math.floor(channels)) : 1;
	webAudioMono = (this.audioChannels == 1) ? true : false;
	XAudioJSSampleRate = (sampleRate >= 100 || sampleRate < 256000) ? Math.floor(sampleRate) : 22050;
	webAudioMinBufferSize = (minBufferSize >= 2 * resamplingRate && minBufferSize < maxBufferSize) ? Math.floor(minBufferSize) : (resamplingRate * 2);
	webAudioMaxBufferSize = (Math.floor(maxBufferSize) > webAudioMinBufferSize + this.audioChannels) ? Math.floor(maxBufferSize) : (this.minBufferSize * 2);
	this.underRunCallback = (typeof underRunCallback == "function") ? underRunCallback : function () {};
	defaultNeutralValue = (defaultValue >= -1 && defaultValue <= 1) ? defaultValue : 0;
	this.audioType = -1;
	this.initializeAudio();
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
		//mozAudio:
		this.samplesAlreadyWritten += this.audioHandle.mozWriteAudio(buffer);
		var samplesRequested = webAudioMinBufferSize - this.remainingBuffer();
		if (samplesRequested > 0) {
			this.samplesAlreadyWritten += this.audioHandle.mozWriteAudio(this.underRunCallback(samplesRequested));
		}
	}
	else if (this.audioType == 1) {
		//WebKit Audio:
		var length = buffer.length;
		for (var bufferCounter = 0; bufferCounter < length; bufferCounter++) {
			audioContextSampleBuffer[bufferEnd++] = buffer[bufferCounter];
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
		var samplesRequested = webAudioMinBufferSize - this.remainingBuffer();
		if (samplesRequested > 0) {
			buffer = this.underRunCallback(samplesRequested);
			samplesRequested = buffer.length;
			for (var bufferCounter = 0; bufferCounter < samplesRequested; bufferCounter++) {
				audioContextSampleBuffer[bufferEnd++] = buffer[bufferCounter];
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
	else if (this.audioType == 2) {
		//WAV PCM via Data URI:
		this.sampleCount += buffer.length;
		if (this.sampleCount >= webAudioMaxBufferSize) {
			var silenceLength = Math.round(this.audioChannels * XAudioJSSampleRate / 2);
			var silenceBuffer = new Array(silenceLength);
			for (var index = 0; index < silenceLength; index++) {
				silenceBuffer[index] = defaultNeutralValue;
			}
			this.audioHandle.appendBatch(silenceBuffer);	//Try to dampen the unavoidable clicking by padding with the set neutral.
			this.audioHandle.outputAudio();
			this.audioHandle = new AudioThread(this.audioChannels, XAudioJSSampleRate, 16, false);
			this.sampleCount -= webAudioMaxBufferSize;
		}
		this.audioHandle.appendBatch(buffer);
	}
	else if (this.audioType == 3) {
		//Flash Plugin Audio:
		if (this.checkFlashInit()) {
			var samplesRequested = this.writeFlashAudio(buffer);
			if (samplesRequested > 0) {
				//samplesRequested = (webAudioMinBufferSize - samplesRequested > 4096) ? 2 : samplesRequested;
				this.writeFlashAudioNoReturn(this.underRunCallback(samplesRequested));
			}
		}
		else {
			//WAV PCM via Data URI:
			this.sampleCount += buffer.length;
			if (this.sampleCount >= webAudioMaxBufferSize) {
				var silenceLength = Math.round(this.audioChannels * XAudioJSSampleRate / 2);
				var silenceBuffer = new Array(silenceLength);
				for (var index = 0; index < silenceLength; index++) {
					silenceBuffer[index] = defaultNeutralValue;
				}
				this.audioHandle2.appendBatch(silenceBuffer);	//Try to dampen the unavoidable clicking by padding with the set neutral.
				this.audioHandle2.outputAudio();
				this.audioHandle2 = new AudioThread(this.audioChannels, XAudioJSSampleRate, 16, false);
				this.sampleCount -= webAudioMaxBufferSize;
			}
			this.audioHandle2.appendBatch(buffer);
		}
	}
}
//Developer can use this to see how many samples to write (example: minimum buffer allotment minus remaining samples left returned from this function to make sure maximum buffering is done...)
//If -1 is returned, then that means metric could not be done.
XAudioServer.prototype.remainingBuffer = function () {
	if (this.audioType == 0) {
		//mozAudio:
		return (this.samplesAlreadyWritten - this.audioHandle.mozCurrentSampleOffset());
	}
	else if (this.audioType == 1) {
		//WebKit Audio:
		return ((startPosition > bufferEnd) ? (webAudioMaxBufferSize - startPosition + bufferEnd) : (bufferEnd - startPosition));
	}
	else if (this.audioType == 3) {
		//Flash Plugin Audio:
		if (this.checkFlashInit()) {
			return this.audioHandle.remainingSamples();
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
//If you just want your callback called for any possible refill (Execution of callback is still conditional):
XAudioServer.prototype.executeCallback = function () {
	if (this.audioType == 0) {
		//mozAudio:
		var samplesRequested = webAudioMinBufferSize - this.remainingBuffer();
		if (samplesRequested > 0) {
			this.samplesAlreadyWritten += this.audioHandle.mozWriteAudio(this.underRunCallback(samplesRequested));
		}
	}
	else if (this.audioType == 1) {
		//WebKit Audio:
		var samplesRequested = webAudioMinBufferSize - this.remainingBuffer();
		if (samplesRequested > 0) {
			var buffer = this.underRunCallback(samplesRequested);
			samplesRequested = buffer.length;
			for (var bufferCounter = 0; bufferCounter < samplesRequested; bufferCounter++) {
				audioContextSampleBuffer[bufferEnd++] = buffer[bufferCounter];
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
	else if (this.audioType == 3) {
		//Flash Plugin Audio:
		if (this.checkFlashInit()) {
			var samplesRequested = webAudioMinBufferSize - this.remainingBuffer();
			if (samplesRequested > 0) {
				this.writeFlashAudioNoReturn(this.underRunCallback(samplesRequested));
			}
		}
		else {
			//WAV PCM via Data URI:
			if (this.sampleCount > 0) {
				//Output the audio immediately, since we can't utilize the callback...
				this.audioHandle2.outputAudio();
				this.audioHandle2 = new AudioThread(this.audioChannels, XAudioJSSampleRate, 16, false);
				this.sampleCount = 0;
			}
		}
	}
	else if (this.audioType == 2) {
		//WAV PCM via Data URI:
		if (this.sampleCount > 0) {
			//Output the audio immediately, since we can't utilize the callback...
			this.audioHandle.outputAudio();
			this.audioHandle = new AudioThread(this.audioChannels, XAudioJSSampleRate, 16, false);
			this.sampleCount = 0;
		}
	}
}
//DO NOT CALL THIS, the lib calls this internally!
XAudioServer.prototype.initializeAudio = function () {
	try {
		//mozAudio - Synchronous Audio API
		this.audioHandle = new Audio();
		this.audioHandle.mozSetup(this.audioChannels, XAudioJSSampleRate);
		this.samplesAlreadyWritten = 0;
		var emptySampleFrame = (this.audioChannels == 2) ? [0, 0] : [0];
		var prebufferAmount = 0;
		while (this.audioHandle.mozCurrentSampleOffset() == 0) {
			//Mozilla Audio Bugginess Workaround (Firefox freaks out if we don't give it a prebuffer under certain OSes):
			prebufferAmount += this.audioHandle.mozWriteAudio(emptySampleFrame);
		}
		var samplesToDoubleBuffer = prebufferAmount / this.audioChannels;
		//Double the prebuffering for windows:
		for (var index = 0; index < samplesToDoubleBuffer; index++) {
			this.samplesAlreadyWritten += this.audioHandle.mozWriteAudio(emptySampleFrame);
		}
		this.samplesAlreadyWritten += prebufferAmount + this.audioHandle.mozWriteAudio(getFloat32(webAudioMinBufferSize));
		webAudioMinBufferSize += prebufferAmount << 1;
		this.audioType = 0;
	}
	catch (error) {
		if (launchedContext) {
			this.audioType = 1;
			resetWebAudioBuffer();
		}
		else {
			try {
				var objectNodes = document.getElementsByTagName("object");
				var objectNode = null;
				if (objectNodes.length > 0) {
					var index = 0;
					while (index < objectNodes.length) {
						if (objectNodes[index].getAttribute("data") == "XAudioJS.swf") {
							objectNode = objectNodes[index];
						}
						index++;
					}
					if (objectNode) {
						this.audioHandle = objectNode;
						this.audioType = 3;
						return;
					}
				}
				objectNode = document.createElement("object");
				objectNode.setAttribute("style", "position: fixed; bottom: 0px; left: 0px; height: 8px; width: 8px; overflow: hidden;");
				objectNode.setAttribute("type", "application/x-shockwave-flash");
				objectNode.setAttribute("data", "XAudioJS.swf");
				var param = document.createElement("param");
				param.setAttribute("name", "allowscriptaccess");
				param.setAttribute("value", "always");
				objectNode.appendChild(param);
				document.getElementsByTagName("body")[0].appendChild(objectNode);
				this.audioType = 3;
				this.flashInitialized = false;
				this.audioHandle = objectNode;
				this.audioHandle2 = new AudioThread(this.audioChannels, XAudioJSSampleRate, 16, false);
				this.sampleCount = 0;
			}
			catch (error) {
				this.audioHandle = new AudioThread(this.audioChannels, XAudioJSSampleRate, 16, false);
				this.audioType = 2;
				this.sampleCount = 0;
			}
		}
	}
}
XAudioServer.prototype.checkFlashInit = function () {
	if (!this.flashInitialized && this.audioHandle.writeAudio && this.audioHandle.remainingSamples && this.audioHandle.initialize) {
		this.flashInitialized = true;
		this.audioHandle.initialize(XAudioJSSampleRate, webAudioMaxBufferSize, defaultNeutralValue);
	}
	return this.flashInitialized;
}
XAudioServer.prototype.writeFlashAudio = function (buffer) {
	var copyArray = [];
	var length = buffer.length;
	if (this.audioChannels == 2) {
		for (var index = 0; index < length; index++) {
			copyArray[index] = (Math.min(Math.max(buffer[index], -1), 1) * 0x8000) | 0;
		}
	}
	else {
		var index2 = 0;
		for (var index = 0; index < length; index++, index2 += 2) {
			copyArray[index2] = copyArray[index2 + 1] = (Math.min(Math.max(buffer[index], -1), 1) * 0x8000) | 0;
		}
	}
	return webAudioMinBufferSize - this.audioHandle.writeAudio(copyArray.join(" "));
}
XAudioServer.prototype.writeFlashAudioNoReturn = function (buffer) {
	var copyArray = [];
	var length = buffer.length;
	if (this.audioChannels == 2) {
		for (var index = 0; index < length; index++) {
			copyArray[index] = (Math.min(Math.max(buffer[index], -1), 1) * 0x8000) | 0;
		}
	}
	else {
		var index2 = 0;
		for (var index = 0; index < length; index++, index2 += 2) {
			copyArray[index2] = copyArray[index2 + 1] = (Math.min(Math.max(buffer[index], -1), 1) * 0x8000) | 0;
		}
	}
	this.audioHandle.writeAudioNoReturn(copyArray.join(" "));
}
/////////END LIB
//Initialize WebKit Audio Buffer:
function getFloat32(size) {
	try {
		var newBuffer = new Float32Array(size);
	}
	catch (error) {
		var newBuffer = new Array(size);
	}
	for (var audioSampleIndice = 0; audioSampleIndice < size; audioSampleIndice++) {
		//Create a gradual neutral position shift here to make sure we don't cause annoying clicking noises
		//when the developer set neutral position is not 0.
		newBuffer[audioSampleIndice] = defaultNeutralValue * (audioSampleIndice / size);
	}
	return newBuffer;
}
//Audio API Event Handler:
var audioContextHandle = null;
var audioNode = null;
var audioSource = null;
var launchedContext = false;
var resamplingRate = 1024;
var startPosition = 0;
var bufferEnd = 0;
var audioContextSampleBuffer = [];
var webAudioMinBufferSize = 15000;
var webAudioMaxBufferSize = 25000;
var webAudioActualSampleRate = 0;
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
function audioOutputEvent(event) {
	var countDown = 0;
	var buffer1 = event.outputBuffer.getChannelData(0);
	var buffer2 = event.outputBuffer.getChannelData(1);
	var samplesInBuffer = ((startPosition > bufferEnd) ? (webAudioMaxBufferSize - startPosition + bufferEnd) : (bufferEnd - startPosition));
	if (samplesInBuffer < resamplingRate) {
		countDown = resamplingRate - samplesInBuffer;
		var count = 0;
		while (countDown > count) {
			buffer2[count] = buffer1[count] = defaultNeutralValue;
			count++;
		}
	}
	var returned = resampler(buffer1, buffer2, countDown);
	buffer1 = returned[0];
	buffer2 = returned[1];
}
function downsampler(buffer1, buffer2, countDown) {
	if (webAudioMono) {
		//MONO:
		while (countDown < resamplingRate) {
			sampleBase1 = audioContextSampleBuffer[startPosition++];
			if (startPosition == webAudioMaxBufferSize) {
				startPosition = 0;
			}
			for (var sampleIndice = 1; sampleIndice < resampleAmountFloor; sampleIndice++) {
				sampleBase1 += audioContextSampleBuffer[startPosition++];
				if (startPosition == webAudioMaxBufferSize) {
					startPosition = 0;
				}
			}
			startPositionOverflow += resampleAmountRemainder;
			if (startPositionOverflow >= 1) {
				startPositionOverflow--;
				sampleBase1 += audioContextSampleBuffer[startPosition++];
				if (startPosition == webAudioMaxBufferSize) {
					startPosition = 0;
				}
				sampleIndice++;
			}
			buffer2[countDown] = buffer1[countDown] = sampleBase1 / sampleIndice;
			countDown++;
		}
	}
	else {
		//STEREO:
		while (countDown < resamplingRate) {
			sampleBase1 = audioContextSampleBuffer[startPosition++];
			sampleBase2 = audioContextSampleBuffer[startPosition++];
			if (startPosition == webAudioMaxBufferSize) {
				startPosition = 0;
			}
			for (var sampleIndice = 1; sampleIndice < resampleAmountFloor; sampleIndice++) {
				sampleBase1 += audioContextSampleBuffer[startPosition++];
				sampleBase2 += audioContextSampleBuffer[startPosition++];
				if (startPosition == webAudioMaxBufferSize) {
					startPosition = 0;
				}
			}
			startPositionOverflow += resampleAmountRemainder;
			if (startPositionOverflow >= 1) {
				startPositionOverflow--;
				sampleBase1 += audioContextSampleBuffer[startPosition++];
				sampleBase2 += audioContextSampleBuffer[startPosition++];
				if (startPosition == webAudioMaxBufferSize) {
					startPosition = 0;
				}
				sampleIndice++;
			}
			buffer1[countDown] = sampleBase1 / sampleIndice;
			buffer2[countDown++] = sampleBase2 / sampleIndice;
		}
	}
	return [buffer1, buffer2];
}
function upsampler(buffer1, buffer2, countDown) {
	if (webAudioMono) {
		//MONO:
		while (countDown < resamplingRate) {
			buffer2[countDown] = buffer1[countDown] = audioContextSampleBuffer[startPosition];
			countDown++;
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
	else {
		//STEREO:
		while (countDown < resamplingRate) {
			buffer1[countDown] = audioContextSampleBuffer[startPosition];
			buffer2[countDown++] = audioContextSampleBuffer[startPosition + 1];
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
	return [buffer1, buffer2];
}
function noresample(buffer1, buffer2, countDown) {
	if (webAudioMono) {
		//MONO:
		while (countDown < resamplingRate) {
			buffer2[countDown] = buffer1[countDown] = audioContextSampleBuffer[startPosition++];
			if (startPosition == webAudioMaxBufferSize) {
				startPosition = 0;
			}
			countDown++;
		}
	}
	else {
		//STEREO:
		while (countDown < resamplingRate) {
			buffer1[countDown] = audioContextSampleBuffer[startPosition++];
			buffer2[countDown++] = audioContextSampleBuffer[startPosition++];
			if (startPosition == webAudioMaxBufferSize) {
				startPosition = 0;
			}
		}
	}
	return [buffer1, buffer2];
}
//Initialize WebKit Audio Buffer:
function resetWebAudioBuffer() {
	if (launchedContext) {
		resampleAmount = XAudioJSSampleRate / webAudioActualSampleRate;
		resampleAmountFloor = resampleAmount | 0;
		resampleAmountRemainder = resampleAmount - resampleAmountFloor;
		audioContextSampleBuffer = getFloat32(webAudioMaxBufferSize);
		startPosition = 0;
		bufferEnd = webAudioMinBufferSize;
		if (webAudioActualSampleRate < XAudioJSSampleRate) {
			resampler = downsampler;
		}
		else if (webAudioActualSampleRate > XAudioJSSampleRate) {
			resampler = upsampler;
		}
		else {
			resampler = noresample;
		}
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
			audioNode = audioContextHandle.createJavaScriptNode(resamplingRate, 1, 2);	//Create 2 outputs and ignore the input buffer (Just copy buffer 1 over if mono)
			audioNode.onaudioprocess = audioOutputEvent;								//Connect the audio processing event to a handling function so we can manipulate output
			audioSource.connect(audioNode);												//Send and chain the input to the audio manipulation.
			audioNode.connect(audioContextHandle.destination);							//Send and chain the output of the audio manipulation to the system audio output.
			audioSource.noteOn(0);														//Start the loop!
		}
		catch (error) {
			return;
		}
		launchedContext = true;
		resetWebAudioBuffer();
	}
})();