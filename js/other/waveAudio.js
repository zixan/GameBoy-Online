function WAVEAudio(NumChannels, SampleRate, BitsPerSample) {
	this.NumChannels = NumChannels;				//Mono (1), Stereo (2), up to the 2-byte numerical limit.
	this.SampleRate = SampleRate;				//Updates per second for the amplitude.
	this.BitsPerSample = BitsPerSample;			//low quality - 8 bits, high quality - 16 bits.
	this.samples = [];							//Buffer for audio samples.
	this.buildable = false;						//Reserved for sanity checks.
	this.init = function () {
		//First Sanity Check
		if (this.NumChannels >= 0x1 && this.NumChannels <= 0xFFFF && (this.BitsPerSample == 0x8 || this.BitsPerSample == 0x10)) {
			this.buildable = true;
		}
		else {
			throw(new Error("Initial setup values for WAVEAudio were invalid."));
		}
	};
	this.compileWAVE = function () {
		//Convert the buffer data into a raw WAV PCM formated binary stream
		var sampleCount = this.samples.length / this.NumChannels;
		var samplePayloadSize = this.BitsPerSample * this.NumChannels / 0x8;
		var dataPayloadSize = sampleCount * samplePayloadSize;
		var output = "RIFF" + to_little_endian_dword(0x24 + dataPayloadSize) + "WAVE";
		output += "fmt " + to_little_endian_dword(0x10) + to_little_endian_word(0x1) + to_little_endian_word(this.NumChannels) + to_little_endian_dword(this.SampleRate) + to_little_endian_dword(this.SampleRate * samplePayloadSize) + to_little_endian_word(samplePayloadSize) + to_little_endian_word(this.BitsPerSample);
		output += "data" + to_little_endian_dword(dataPayloadSize);
		var index = 0;
		var length = this.samples.length;
		if (this.BitsPerSample == 8) {	//Put this outside the loop for TraceMonkey.
			while (index < length) {
				output += to_byte(this.samples[index++]);
			}
		}
		else {
			while (index < length) {
				output += to_little_endian_word(this.samples[index++]);
			}
		}
		return output;
	};
	this.checkSanity = function (sampleData, isRelative) {
		//WAV PCM Data Sanity Check
		if (this.buildable && sampleData.length == this.NumChannels) {
			var totalChannels = sampleData.length;
			for (var channel = 0; channel < totalChannels; ++channel) {
				var dataUnit = (isRelative) ? this.convertRelativeUnits(sampleData[channel]) : sampleData[channel];
				switch (this.BitsPerSample) {
					case 0x8:
						if (dataUnit < 0 || dataUnit > 0xFF) {
							return false;
						}
						break;
					case 0x10:
						if (dataUnit < -0x8000 || dataUnit > 0x7FFF) {
							return false;
						}
				}
			}
			return true;
		}
		return false;
	};
	this.convertRelativeUnits = function (sampleData) {
		//Map relative audio values to WAV PCM values.
		switch (this.BitsPerSample) {
			case 0x8:
				return Math.round(sampleData * 127.5 + 127.5);
				break;
			case 0x10:
				return Math.round(sampleData * 32767.5 - 0.5);
		}
	};
	this.init();
}
WAVEAudio.prototype.appendSample = function (sampleData, isRelative) {
	//WAV Buffer access.
	if (this.checkSanity(sampleData, isRelative)) {
		var channel = 0;
		var channels = sampleData.length;
		while (channel < channels) {
			this.samples.push((isRelative) ? this.convertRelativeUnits(sampleData[channel++]) : sampleData[channel++]);
		}
	}
	else {
		throw(new Error("Could not append sample data into the WAVE PCM data."));
	}
}
WAVEAudio.prototype.dumpSamples = function () {
	//WAV Buffer clear.
	this.samples = [];
}
WAVEAudio.prototype.replaceSample = function (newSample, samplePosition, isRelative) {
	//WAV Buffer sample replace.
	if (this.checkSanity(newSample, isRelative) && !isNaN(this.samples[samplePosition * this.NumChannels])) {
		for (var currentChannel = 0; currentChannel < this.NumChannels; currentChannel++) {
			this.samples[(samplePosition * this.NumChannels) + currentChannel] = (isRelative) ? this.convertRelativeUnits(newSample[channel]) : newSample[channel];
		}
	}
	else {
		throw(new Error("Could not replace a sample in the WAVE PCM data."));
	}
}
WAVEAudio.prototype.removeSamples = function (samplePosition, amount) {
	//WAV Buffer sample removal.
	if (isNaN(this.samples[samplePosition * this.NumChannels])) {
		this.samples.splice(samplePosition * this.NumChannels, amount * this.NumChannels);
	}
	else {
		throw(new Error("Could not remove a sample in the WAVE PCM data."));
	}
}
WAVEAudio.prototype.dataURI = function () {
	//WAV Buffer output (via dataURI)
	if (this.buildable) {
		return "data:audio/wav;base64," + base64(this.compileWAVE());
	}
	else {
		throw(new Error("Could not output base64 encoded WAVE PCM data into a data URI."));
	}
}