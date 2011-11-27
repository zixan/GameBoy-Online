//JavaScript Audio Resampler (c) 2011 - Grant Galitz
function Resampler(fromSampleRate, toSampleRate, channels, outputBufferSize, qualityLevel) {
	this.fromSampleRate = fromSampleRate;
	this.toSampleRate = toSampleRate;
	this.channels = channels | 0;
	this.outputBufferSize = outputBufferSize;
	this.qualityLevel = qualityLevel;	//Will add sinc later...
	this.initialize();
}
Resampler.prototype.initialize = function () {
	//Perform some checks:
	if (this.fromSampleRate > 0 && this.toSampleRate > 0 && this.channels > 0) {
		if (this.fromSampleRate == this.toSampleRate) {
			//Setup a resampler bypass:
			this.resampler = this.bypassResampler;		//Resampler just returns what was passed through.
			this.ratioWeight = 1;
		}
		else {
			//Setup the interpolation resampler:
			this.resampler = this.interpolate;			//Resampler is a custom quality interpolation algorithm.
			this.ratioWeight = this.fromSampleRate / this.toSampleRate;
			this.lastWeight = [];
			this.lastOutput = [];
			this.lastTotalWeight = [];
		}
		//Initialize the internal buffer:
		try {
			this.outputBuffer = new Float32Array(this.outputBufferSize);
		}
		catch (error) {
			this.outputBuffer = [];
		}
	}
	else {
		throw(new Error("Invalid settings specified for the resampler."));
	}
}
Resampler.prototype.interpolate = function (buffer) {
	//Get the number of channels and buffer length:
	var channels = this.channels;
	var bufferLength = buffer.length;
	//Make sure the buffer fits the sample frame boundaries:
	if ((bufferLength % channels) == 0) {
		//Make sure we only run on non-empty buffers:
		if (bufferLength > 0) {
			//Initialize our local variables:
			var ratioWeight = this.ratioWeight;
			var weight = 0;
			var output = 0;
			var totalWeight = 0;
			var actualPosition = 0;
			var amountToNext = 0;
			var incompleteRunLength = this.lastWeight.length;
			var lockedOut = false;
			var outputBuffer = this.outputBuffer;
			var outputOffset = 0;
			var currentPosition = 0;
			var channel = 0;
			//Interpolate by channel:
			do {
				//Initialize our channel-specific offsets:
				currentPosition = channel;
				outputOffset = channel++;
				lockedOut = false;	//Lock out the loop from getting more than one incomplete-tail set per channel computation.
				//Interpolate the current channel we're working on:
				do {
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
					//Where we do the actual interpolation math:
					while (weight > 0 && currentPosition < bufferLength) {
						actualPosition = currentPosition | 0;
						amountToNext = 1 + actualPosition - currentPosition;
						if (weight > amountToNext) {
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
						outputBuffer[outputOffset] = output / totalWeight;	//Divide by the spanning amount.
						outputOffset += channels;							//Go to the next frame (NOT sample).
					}
					else {
						//Save the tail interpolation state for the next buffer to pass through:
						this.lastWeight.push(weight);
						this.lastOutput.push(output);
						this.lastTotalWeight.push(totalWeight);
						break;
					}
				} while (currentPosition < bufferLength);
			} while (channel < channels);
			//Return our interpolated data:
			return this.bufferSlice(outputOffset - channels + 1);
		}
		else {
			//Return an empty array back if given an empty buffer:
			return [];
		}
	}
	else {
		throw(new Error("Buffer was of incorrect sample length."));
	}
}
Resampler.prototype.bypassResampler = function (buffer) {
	//Just return the buffer passsed:
	return buffer;
}
Resampler.prototype.bufferSlice = function (sliceAmount) {
	//Typed array and normal array buffer section referencing:
	try {
		return this.outputBuffer.subarray(0, sliceAmount);
	}
	catch (error) {
		this.outputBuffer.length = sliceAmount;
		return this.outputBuffer;
	}
}