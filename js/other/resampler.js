//JavaScript Audio Resampler (c) 2011 - Grant Galitz
function Resampler(fromSampleRate, toSampleRate, channels, qualityLevel) {
	this.fromSampleRate = fromSampleRate;
	this.toSampleRate = toSampleRate;
	this.channels = channels | 0;
	this.qualityLevel = qualityLevel;	//Will add sinc later...
	this.initialize();
}
Resampler.prototype.initialize = function () {
	//Perform some checks:
	if (this.fromSampleRate > 0 && this.toSampleRate > 0 && this.channels > 0) {
		if (this.fromSampleRate == this.toSampleRate) {
			//Setup a resampler bypass:
			this.resampler = this.bypassResampler;
			this.ratioWeight = 1;
		}
		else {
			this.resampler = this.interpolate;
			this.ratioWeight = this.fromSampleRate / this.toSampleRate;
		}
	}
	else {
		throw(new Error("Invalid settings specified for the resampler."));
	}
}
Resampler.prototype.interpolate = function (buffer) {
	var bufferLength = buffer.length;
	if ((bufferLength % this.channels) == 0) {
		var weight = this.ratioWeight;
		var output = 0;
		var totalWeight = 0;
		var actualPosition = 0;
		var amountToNext = 0;
		var outputBuffer = [];
		for (var channel = 0, outputOffset = 0, currentPosition = 0; channel < this.channels; ++channel) {
			currentPosition = channel;
			outputOffset = channel;
			while (currentPosition < bufferLength) {
				weight = this.ratioWeight;
				output = 0;
				totalWeight = 0;
				while (weight > 0 && currentPosition < bufferLength) {
					actualPosition = currentPosition | 0;
					amountToNext = 1 + actualPosition - currentPosition;
					if (weight >= amountToNext) {
						output += buffer[actualPosition] * amountToNext;
						totalWeight += amountToNext;
						currentPosition = actualPosition + this.channels;
						weight -= amountToNext;
					}
					else {
						output += buffer[actualPosition] * weight;
						totalWeight += weight;
						currentPosition += weight;
						break;
					}
				}
				outputBuffer[outputOffset] = output / totalWeight;
				outputOffset += this.channels;
			}
		}
		return outputBuffer;
	}
	else {
		throw(new Error("Buffer of odd length"));
	}
}
Resampler.prototype.bypassResampler = function (buffer) {
	return buffer;
}