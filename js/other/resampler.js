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
			this.initializeBuffers(false);
		}
		else {
			//Setup the interpolation resampler:
			this.resampler = this.interpolate;			//Resampler is a custom quality interpolation algorithm.
			this.ratioWeight = this.fromSampleRate / this.toSampleRate;
			this.tailExists = false;
			this.initializeBuffers(true);
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
			var tailExists = this.tailExists;		//See if a tail exists for this iteration.
			this.tailExists = false;				//Reset tail exists state.
			var alreadyProcessedTail = false;
			var outputBuffer = this.outputBuffer;
			var outputOffset = 0;
			var currentPosition = 0;
			var channel = 0;
			//Interpolate by channel:
			do {
				//Initialize our channel-specific offsets:
				currentPosition = channel;
				outputOffset = channel;
				alreadyProcessedTail = !tailExists;	//Track whether we processed the tail for the working channel yet.
				//Interpolate the current channel we're working on:
				do {
					if (alreadyProcessedTail) {
						//Don't use the previous state values:
						weight = ratioWeight;
						output = 0;
						totalWeight = 0;
					}
					else {
						//Use the previous state values:
						weight = this.lastWeight[channel];
						output = this.lastOutput[channel];
						totalWeight = this.lastTotalWeight[channel];
						alreadyProcessedTail = true;
					}
					//Where we do the actual interpolation math:
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
						outputBuffer[outputOffset] = output / totalWeight;	//Divide by the spanning amount.
						outputOffset += channels;							//Go to the next frame (NOT sample).
					}
					else {
						//Save the tail interpolation state for the next buffer to pass through:
						this.lastWeight[channel] = weight;
						this.lastOutput[channel] = output;
						this.lastTotalWeight[channel] = totalWeight;
						this.tailExists = true;
						break;
					}
				} while (currentPosition < bufferLength);
			} while (++channel < channels);
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
		try {
			//Regular array pass:
			this.outputBuffer.length = sliceAmount;
			return this.outputBuffer;
		}
		catch (error) {
			//Nightly Firefox 4 used to have the subarray function named as slice:
			return this.outputBuffer.slice(0, sliceAmount);
		}
	}
}
Resampler.prototype.initializeBuffers = function (generateTailCache) {
	//Initialize the internal buffer:
	try {
		this.outputBuffer = new Float32Array(this.outputBufferSize);
		if (generateTailCache) {
			this.lastWeight = new Float32Array(this.channels);
			this.lastOutput = new Float32Array(this.channels);
			this.lastTotalWeight = new Float32Array(this.channels);
		}
	}
	catch (error) {
		this.outputBuffer = [];
		if (generateTailCache) {
			this.lastWeight = [];
			this.lastOutput = [];
			this.lastTotalWeight = [];
		}
	}
}