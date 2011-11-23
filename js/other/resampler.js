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
			this.lastWeight = [];
			this.lastOutput = [];
			this.lastTotalWeight = [];
		}
	}
	else {
		throw(new Error("Invalid settings specified for the resampler."));
	}
}
Resampler.prototype.interpolate = function (buffer) {
	var channels = this.channels;
	var bufferLength = buffer.length;
	if ((bufferLength % channels) == 0) {
		var ratioWeight = this.ratioWeight;
		var weight = 0;
		var output = 0;
		var totalWeight = 0;
		var actualPosition = 0;
		var amountToNext = 0;
		var incompleteRunLength = this.lastWeight.length;
		var lockedOut = false;
		var outputBuffer = [];
		for (var channel = 0, outputOffset = 0, currentPosition = 0; channel < channels; ++channel) {
			currentPosition = channel;
			outputOffset = channel;
			lockedOut = false;
			while (currentPosition < bufferLength) {
				if (lockedOut || incompleteRunLength == 0) {
					//Don't use the previous state values:
					weight = ratioWeight;
					output = 0;
					totalWeight = 0;
				}
				else {
					//Use the previous state values:
					weight = this.lastWeight.shift();
					output = this.lastOutput.shift();
					totalWeight = this.lastTotalWeight.shift();
					--incompleteRunLength;
					lockedOut = true;
				}
				while (weight > 0 && currentPosition < bufferLength) {
					actualPosition = currentPosition | 0;
					amountToNext = 1 + actualPosition - currentPosition;
					if (weight >= amountToNext) {
						//Needs another loop pass for completion, so build up:
						output += buffer[actualPosition] * amountToNext;
						totalWeight += amountToNext;
						currentPosition = actualPosition + channels;
						weight -= amountToNext;
					}
					else {
						//Iteration was able to complete fully:
						output += buffer[actualPosition] * weight;
						totalWeight += weight;
						currentPosition += weight;
						weight = 0;
						break;
					}
				}
				if (weight == 0) {
					//Single iteration completed fully:
					outputBuffer[outputOffset] = output / totalWeight;
					outputOffset += channels;
				}
				else {
					//Save the tail interpolation state for the next buffer to pass through:
					this.lastWeight.push(weight);
					this.lastOutput.push(output);
					this.lastTotalWeight.push(totalWeight);
				}
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