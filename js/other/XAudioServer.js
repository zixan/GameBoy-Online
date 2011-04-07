function XAudioServer(channels, sampleRate, minBufferSize, maxBufferSize, underRunCallback) {
	this.audioChannels = (channels >= 1) ? Math.floor(channels) : 1;
	webAudioMono = (this.audioChannels == 1) ? true : false;
	this.sampleRate = (sampleRate >= 100) ? Math.floor(sampleRate) : 22050;
	webAudioMinBufferSize = (minBufferSize >= 2 * resamplingRate) ? Math.floor(minBufferSize) : (resamplingRate * 2);
	webAudioMaxBufferSize = (Math.floor(maxBufferSize) > webAudioMinBufferSize + this.audioChannels) ? Math.floor(maxBufferSize) : (this.minBufferSize + this.audioChannels);
	this.underRunCallback = underRunCallback;
	this.audioType = -1;
	this.initializeAudio();
}
XAudioServer.prototype.initializeAudio = function () {
	try {
		//mozAudio - Synchronous Audio API
		this.audioHandle = new Audio();
		this.audioHandle.mozSetup(this.audioChannels, this.sampleRate);
		this.samplesAlreadyWritten = this.audioHandle.mozWriteAudio(getFloat32(webAudioMinBufferSize, -1));
		this.audioType = 0;
	}
	catch (error) {
		if (launchedContext) {
			resetWebAudioBuffer();
			var resampleAmount = this.sampleRate / webAudioActualSampleRate;
			resampleAmountFloor = resampleAmount | 0;
			resampleAmountRemainder = resampleAmount - resampleAmountFloor;
			this.audioType = 1;
		}
		else {
			this.audioHandle = new AudioThread(this.audioChannels, this.sampleRate, 16, false);
			this.audioType = 2;
			this.sampleCount = 0;
		}
	}
}
XAudioServer.prototype.writeAudio = function (buffer) {
	if (this.audioType == 0) {
		//mozAudio
		var sampleOffset = this.audioHandle.mozCurrentSampleOffset();
		var samplesRequested = webAudioMinBufferSize - this.samplesAlreadyWritten + sampleOffset;
		this.samplesAlreadyWritten += this.audioHandle.mozWriteAudio(buffer);
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
		var samplesRequested = webAudioMinBufferSize - ((startPosition > bufferEnd) ? (webAudioMaxBufferSize - startPosition + bufferEnd) : (bufferEnd - startPosition));
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
		//WAV PCM via Data URI
		this.sampleCount += buffer.length;
		if (this.sampleCount >= webAudioMaxBufferSize) {
			this.audioHandle.outputAudio();
			this.audioHandle = new AudioThread(this.audioChannels, this.sampleRate, 16, false);
			this.sampleCount -= webAudioMaxBufferSize;
		}
		this.audioHandle.appendBatch(buffer);
	}
}
//Initialize WebKit Audio Buffer:
function getFloat32(size, defaultValue) {
	try {
		var newBuffer = new Float32Array(size);
	}
	catch (error) {
		var newBuffer = new Array(size);
	}
	for (var audioSampleIndice = 0; audioSampleIndice < size; audioSampleIndice++) {
		//Initialize to zero:
		newBuffer[audioSampleIndice] = defaultValue;
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
var webAudioMono = false;
var sampleBase1 = 0;
var sampleBase2 = 0;
var startPositionOverflow = 0;
var resampleAmountFloor = 0;
var resampleAmountRemainder = 0;
function audioOutputEvent(event) {
	var countDown = 0;
	var buffer1 = event.outputBuffer.getChannelData(0);
	var buffer2 = event.outputBuffer.getChannelData(1);
	var samplesInBuffer = ((startPosition > bufferEnd) ? (webAudioMaxBufferSize - startPosition + bufferEnd) : (bufferEnd - startPosition));
	if (samplesInBuffer < resamplingRate) {
		countDown = resamplingRate - samplesInBuffer;
		var count = 0;
		while (countDown > count) {
			buffer2[count] = buffer1[count] = 0;
			count++;
		}
	}
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
}
//Initialize WebKit Audio Buffer:
function resetWebAudioBuffer() {
	if (launchedContext) {
		try {
			audioContextSampleBuffer = new Float32Array(webAudioMaxBufferSize);
		}
		catch (error) {
			audioContextSampleBuffer = new Array(webAudioMaxBufferSize);
			for (var audioSampleIndice = 0; audioSampleIndice < webAudioMaxBufferSize; audioSampleIndice++) {
				//Initialize to zero:
				audioContextSampleBuffer[audioSampleIndice] = 0;
			}
		}
		audioContextSampleBuffer = getFloat32(webAudioMaxBufferSize, -1);
		startPosition = 0;
		bufferEnd = 0;
	}
}
//Initialize WebKit Audio:
(function () {
	if (!launchedContext) {
		/*Get the one continuous audio loop rolling, as the loop will update
		the audio asynchronously by inspecting the gameboy object periodically.
		Variables and event handling functions have to be globally declared to prevent a bad bug in an experimental Safari build!*/
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
			webAudioActualSampleRate = audioContextHandle.sampleRate;
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
	}
})();