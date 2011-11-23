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
	this.buffer = buffer;
	this.bufferLength = buffer.length;
	if ((this.bufferLength % this.channels) == 0) {
		var outputBuffer = [];
		for (var channel = 0, outputOffset = 0; channel < this.channels; ++channel) {
			this.currentPosition = channel;
			outputOffset = channel;
			while (this.currentPosition < this.bufferLength) {
				outputBuffer[outputOffset] = this.interpolationIteration();
				outputOffset += this.channels;
			}
		}
		return outputBuffer;
	}
	else {
		throw(new Error("Buffer of odd length"));
	}
}
Resampler.prototype.interpolationIteration = function () {
	var weight = this.ratioWeight;
	var output = 0;
	var totalWeight = 0;
	var actualPosition = 0;
	var amountToNext = 0;
	while (weight > 0 && this.currentPosition < this.bufferLength) {
		actualPosition = this.currentPosition | 0;
		amountToNext = 1 + actualPosition - this.currentPosition;
		if (weight >= amountToNext) {
			output += this.buffer[actualPosition] * amountToNext;
			totalWeight += amountToNext;
			this.currentPosition = actualPosition + this.channels;
			weight -= amountToNext;
		}
		else {
			output += this.buffer[actualPosition] * weight;
			totalWeight += weight;
			this.currentPosition += weight;
			break;
		}
	}
	return output / totalWeight;
}
Resampler.prototype.bypassResampler = function (buffer) {
	return buffer;
}