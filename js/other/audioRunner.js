function AudioThread(NumChannels, SampleRate) {
	this.NumChannels = NumChannels;
	this.SampleRate = SampleRate;
	this.BitsPerSample = (typeof arguments[2] == "number") ? arguments[2] : 16;
	this.autoContinue = (typeof arguments[3] == "boolean" && arguments[3]) ? true : false;
	this.type = 0;	//0 - no support, 1 - WAVE PCM support
	this.audioHandle;
	this.waveHandle;
	this.ended = false;
	this.init = function () {
		//Sanity Check
		this.checkAudioSupport();
		try {
			switch (this.type) {
				case 1:
					//Note for canPlayType: WebKit *will* fail if it's not explicitly audio/wav (Tested w/ Safari 5)
					//Another Note: WebKit used to reply "no" instead of an empty string as a response for non-support.
					//Another Note: Google Chrome as of today writing this doesn't support WAV PCM through the data uri when injected into an audio object.
					if (typeof this.audioHandle.canPlayType == "function") {
						if (this.audioHandle.canPlayType("audio/wav") === "" || this.audioHandle.canPlayType("audio/wav") == "no") {
							this.notSupported();
						}
					}
				case 2:
					this.waveHandle = new WAVEAudio(this.NumChannels, this.SampleRate, this.BitsPerSample);
					break;
				default:
					this.notSupported();
			}
		}
		catch (error) {
			throw(new Error(error.message));
		}
	};
	this.checkAudioSupport = function () {
		try {
			this.audioHandle = new Audio();
			this.type = 1;
		}
		catch (error) {
			throw(new Error("Could not find audio support."));
		}
	};
	this.notSupported = function () {
		this.type = 0;
		throw(new Error("A generic audio error in AudioThread has been issued."));
	};
	this.init();
}
AudioThread.prototype.appendSample = function (sampleData) {
	//Wrapped Buffer access
	this.waveHandle.appendSample(sampleData, true);
}
AudioThread.prototype.appendBatch = function (sampleDataArray) {
	//UNSAFE Batch array appending!
	//You better know what you're doing!!!
	var length = sampleDataArray.length;
	var index = 0;
	while (index < length) {
		this.waveHandle.samples.push(this.waveHandle.convertRelativeUnits(sampleDataArray[index++]));
	}
}
AudioThread.prototype.replaceSamples = function (newSample, samplePosition) {
	//Wrapped Buffer access
	this.waveHandle.replaceSamples(newSample, samplePosition, true);
}
AudioThread.prototype.removeSamples = function (samplePosition, amount) {
	//Wrapped Buffer access
	this.waveHandle.removeSamples(samplePosition, amount);
}
AudioThread.prototype.dumpSamples = function () {
	//Wrapped Buffer clear
	this.waveHandle.dumpSamples();
}
AudioThread.prototype.outputAudio = function () {
	//Wrapped Buffer Output
	if (this.type == 1) {
		this.audioHandle.setAttribute("src", this.waveHandle.dataURI());
		if (this.autoContinue) {
			this.audioHandle.setAttribute("loop", "loop");
		}
		if (this.audioHandle.error === null) {
			this.audioHandle.play();
		}
		else {
			this.notSupported();
		}
	}
	else {
		this.notSupported();
	}
}
AudioThread.prototype.abort = function () {
	this.audioHandle.pause();
}