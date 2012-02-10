//JavaScript Image Resizer (c) 2012 - Grant Galitz
function Resize(widthOriginal, heightOriginal, targetWidth, targetHeight) {
	this.widthOriginal = widthOriginal >>> 0;
	this.heightOriginal = heightOriginal >>> 0;
	this.targetWidth = targetWidth >>> 0;
	this.targetHeight = targetHeight >>> 0;
	this.targetWidthMultipliedByChannels = this.targetWidth << 2;
	this.originalWidthMultipliedByChannels = this.widthOriginal << 2;
	this.originalHeightMultipliedByChannels = this.heightOriginal << 2;
	this.widthPassResultSize = this.targetWidthMultipliedByChannels * this.heightOriginal;
	this.finalResultSize = this.targetWidthMultipliedByChannels * this.targetHeight;
	this.initialize();
}
Resize.prototype.initialize = function () {
	//Perform some checks:
	if (this.widthOriginal > 0 && this.heightOriginal > 0 && this.targetWidth > 0 && this.targetHeight > 0) {
		if (this.widthOriginal == this.targetWidth && this.heightOriginal == this.targetHeight) {
			//Setup a resizer bypass:
			this.resize = this.bypassResizer;
		}
		else if (this.widthOriginal == this.targetWidth) {
			//Bypass the width resizer pass:
			this.ratioWeightHeightPass = this.heightOriginal / this.targetHeight;
			this.initializeSecondPassBuffers();
			this.resize = this.resizeHeight;
		}
		else if (this.heightOriginal == this.targetHeight) {
			//Bypass the height resizer pass:
			this.ratioWeightWidthPass = this.widthOriginal / this.targetWidth;
			this.initializeFirstPassBuffers();
			this.resize = this.resizeWidth;
		}
		else {
			//Resize the image with two passes:
			this.ratioWeightWidthPass = this.widthOriginal / this.targetWidth;
			this.ratioWeightHeightPass = this.heightOriginal / this.targetHeight;
			this.initializeFirstPassBuffers();
			this.initializeSecondPassBuffers();
			this.resize = this.resizer;
		}
	}
	else {
		throw(new Error("Invalid settings specified for the resizer."));
	}
}
Resize.prototype.resizeWidth = function (buffer) {
	var ratioWeight = this.ratioWeightWidthPass;
	var weight = 0;
	var amountToNext = 0;
	var actualPosition = 0;
	var currentPosition = 0;
	var line = 0;
	var pixelOffset = 0;
	var outputOffset = 0;
	var nextLineOffsetOriginalWidth = this.originalWidthMultipliedByChannels - 3;
	var nextLineOffsetTargetWidth = this.targetWidthMultipliedByChannels - 3;
	var output = this.outputWidthWorkBench;
	var outputBuffer = this.widthBuffer;
	do {
		for (line = 0; line < this.originalHeightMultipliedByChannels;) {
			output[line++] = 0;
			output[line++] = 0;
			output[line++] = 0;
			output[line++] = 0;
		}
		weight = ratioWeight;
		do {
			amountToNext = 1 + actualPosition - currentPosition;
			if (weight >= amountToNext) {
				for (line = 0, pixelOffset = actualPosition; line < this.originalHeightMultipliedByChannels; pixelOffset += nextLineOffsetOriginalWidth) {
					output[line++] += buffer[pixelOffset++] * amountToNext;
					output[line++] += buffer[pixelOffset++] * amountToNext;
					output[line++] += buffer[pixelOffset++] * amountToNext;
					output[line++] += buffer[pixelOffset] * amountToNext;
				}
				currentPosition = actualPosition = actualPosition + 4;
				weight -= amountToNext;
			}
			else {
				for (line = 0, pixelOffset = actualPosition; line < this.originalHeightMultipliedByChannels; pixelOffset += nextLineOffsetOriginalWidth) {
					output[line++] += buffer[pixelOffset++] * weight;
					output[line++] += buffer[pixelOffset++] * weight;
					output[line++] += buffer[pixelOffset++] * weight;
					output[line++] += buffer[pixelOffset] * weight;
				}
				currentPosition += weight;
				break;
			}
		} while (weight > 0 && actualPosition < this.originalWidthMultipliedByChannels);
		for (line = 0, pixelOffset = outputOffset; line < this.originalHeightMultipliedByChannels; pixelOffset += nextLineOffsetTargetWidth) {
			outputBuffer[pixelOffset++] = output[line++] / ratioWeight;
			outputBuffer[pixelOffset++] = output[line++] / ratioWeight;
			outputBuffer[pixelOffset++] = output[line++] / ratioWeight;
			outputBuffer[pixelOffset] = output[line++] / ratioWeight;
		}
		outputOffset += 4;
	} while (outputOffset < this.targetWidthMultipliedByChannels);
	return outputBuffer;
}
Resize.prototype.resizeHeight = function (buffer) {
	var ratioWeight = this.ratioWeightHeightPass;
	var weight = 0;
	var amountToNext = 0;
	var actualPosition = 0;
	var currentPosition = 0;
	var pixelOffset = 0;
	var outputOffset = 0;
	var output = this.outputHeightWorkBench;
	var outputBuffer = this.heightBuffer;
	do {
		for (pixelOffset = 0; pixelOffset < this.targetWidthMultipliedByChannels;) {
			output[pixelOffset++] = 0;
			output[pixelOffset++] = 0;
			output[pixelOffset++] = 0;
			output[pixelOffset++] = 0;
		}
		weight = ratioWeight;
		do {
			amountToNext = 1 + actualPosition - currentPosition;
			if (weight >= amountToNext) {
				for (pixelOffset = 0; pixelOffset < this.targetWidthMultipliedByChannels;) {
					output[pixelOffset++] += buffer[actualPosition++] * amountToNext;
					output[pixelOffset++] += buffer[actualPosition++] * amountToNext;
					output[pixelOffset++] += buffer[actualPosition++] * amountToNext;
					output[pixelOffset++] += buffer[actualPosition++] * amountToNext;
				}
				currentPosition = actualPosition;
				weight -= amountToNext;
			}
			else {
				for (pixelOffset = 0, amountToNext = actualPosition; pixelOffset < this.targetWidthMultipliedByChannels;) {
					output[pixelOffset++] += buffer[amountToNext++] * weight;
					output[pixelOffset++] += buffer[amountToNext++] * weight;
					output[pixelOffset++] += buffer[amountToNext++] * weight;
					output[pixelOffset++] += buffer[amountToNext++] * weight;
				}
				currentPosition += weight;
				break;
			}
		} while (weight > 0 && actualPosition < this.widthPassResultSize);
		for (pixelOffset = 0; pixelOffset < this.targetWidthMultipliedByChannels;) {
			outputBuffer[outputOffset++] = output[pixelOffset++] / ratioWeight;
			outputBuffer[outputOffset++] = output[pixelOffset++] / ratioWeight;
			outputBuffer[outputOffset++] = output[pixelOffset++] / ratioWeight;
			outputBuffer[outputOffset++] = output[pixelOffset++] / ratioWeight;
		}
	} while (outputOffset < this.finalResultSize);
	return outputBuffer;
}
Resize.prototype.resizer = function (buffer) {
	return this.resizeHeight(this.resizeWidth(buffer));
}
Resize.prototype.bypassResizer = function (buffer) {
	//Just return the buffer passsed:
	return buffer;
}
Resize.prototype.initializeFirstPassBuffers = function () {
	//Initialize the internal width pass buffers:
	this.widthBuffer = this.generateFloatBuffer(this.widthPassResultSize);
	this.outputWidthWorkBench = this.generateFloatBuffer(this.originalHeightMultipliedByChannels);
}
Resize.prototype.initializeSecondPassBuffers = function () {
	//Initialize the internal height pass buffers:
	this.heightBuffer = this.generateFloatBuffer(this.finalResultSize);
	this.outputHeightWorkBench = this.generateFloatBuffer(this.targetWidthMultipliedByChannels);
}
Resize.prototype.generateFloatBuffer = function (bufferLength) {
	//Generate a float32 typed array buffer:
	try {
		return new Float32Array(bufferLength);
	}
	catch (error) {
		return [];
	}
}