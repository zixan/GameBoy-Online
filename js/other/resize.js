//JavaScript Image Resizer (c) 2012 - Grant Galitz
function Resize(widthOriginal, heightOriginal, targetWidth, targetHeight) {
	this.widthOriginal = widthOriginal >>> 0;
	this.heightOriginal = heightOriginal >>> 0;
	this.targetWidth = targetWidth >>> 0;
	this.targetHeight = targetHeight >>> 0;
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
			this.initializeSecondPassBuffer();
			this.compileHeightResize();
			this.resize = this.resizeHeight;
		}
		else if (this.heightOriginal == this.targetHeight) {
			//Bypass the height resizer pass:
			this.initializeFirstPassBuffer();
			this.compileWidthResize();
			this.resize = this.resizeWidth;
		}
		else {
			//Resize the image with two passes:
			this.initializeFirstPassBuffer();
			this.initializeSecondPassBuffer();
			this.compileWidthResize();
			this.compileHeightResize();
			this.resize = this.resizer;
		}
	}
	else {
		throw(new Error("Invalid settings specified for the resizer."));
	}
}
Resize.prototype.compileWidthResize = function () {
	this.ratioWidthWeight = this.widthOriginal / this.targetWidth;
	var widthOrigMulChannels = this.widthOriginal << 2;
	var heightOrigMulChannels = this.heightOriginal << 2;
	var widthTargetMulChannels = this.targetWidth << 2;
	var pixelOffset = 0;
	var temp_var = 0;
	var toCompile = "\
	var ratioWeight = this.ratioWidthWeight;\
	var weight = 0;\
	var actualPosition = 0;\
	var amountToNext = 0;\
	var outputBuffer = this.widthBuffer;\
	var outputOffset = 0;\
	var currentPosition = 0;\
	var output = this.outputWidthWorkBench;\
	do {\
		weight = ratioWeight;";
	for (line = 0; line < heightOrigMulChannels; ++line) {
		toCompile += "\
		output[" + line + "] = 0;";
	}
	toCompile += "\
		while (weight > 0 && actualPosition < " + widthOrigMulChannels + ") {\
			amountToNext = 1 + actualPosition - currentPosition;\
			if (weight >= amountToNext) {";
	for (pixelOffset = line = 0; line < heightOrigMulChannels; pixelOffset += widthOrigMulChannels) {
		temp_var = pixelOffset;
		toCompile += "\
				output[" + (line++) + "] += buffer[actualPosition" + ((temp_var > 0) ? (" + " + temp_var) : "") + "] * amountToNext;";
		++temp_var;		
		toCompile += "\
				output[" + (line++) + "] += buffer[actualPosition + " + (temp_var++) + "] * amountToNext;\
				output[" + (line++) + "] += buffer[actualPosition + " + (temp_var++) + "] * amountToNext;\
				output[" + (line++) + "] += buffer[actualPosition + " + temp_var + "] * amountToNext;";
	}
	toCompile += "\
				currentPosition = actualPosition = actualPosition + 4;\
				weight -= amountToNext;\
			}\
			else {";
	for (pixelOffset = line = 0; line < heightOrigMulChannels; pixelOffset += widthOrigMulChannels) {
		temp_var = pixelOffset;
		toCompile += "\
				output[" + (line++) + "] += buffer[actualPosition" + ((temp_var > 0) ? (" + " + temp_var) : "") + "] * weight;";
		++temp_var;		
		toCompile += "\
				output[" + (line++) + "] += buffer[actualPosition + " + (temp_var++) + "] * weight;\
				output[" + (line++) + "] += buffer[actualPosition + " + (temp_var++) + "] * weight;\
				output[" + (line++) + "] += buffer[actualPosition + " + temp_var + "] * weight;";
	}
	toCompile += "\
				currentPosition += weight;\
				break;\
			}\
		}";
	for (pixelOffset = line = 0; line < heightOrigMulChannels; pixelOffset += widthTargetMulChannels) {
		temp_var = pixelOffset;
		toCompile += "\
		outputBuffer[outputOffset" + ((temp_var > 0) ? (" + " + temp_var) : "") + "] = output[" + (line++) + "] / ratioWeight;";
		++temp_var;
		toCompile += "\
		outputBuffer[outputOffset + " + (temp_var++) + "] = output[" + (line++) + "] / ratioWeight;\
		outputBuffer[outputOffset + " + (temp_var++) + "] = output[" + (line++) + "] / ratioWeight;\
		outputBuffer[outputOffset + " + temp_var + "] = output[" + (line++) + "] / ratioWeight;";
	}
	toCompile += "\
		outputOffset += 4;\
	} while (outputOffset < " + widthTargetMulChannels + ");\
	return outputBuffer;";
	this.resizeWidth = Function("buffer", toCompile);
}
Resize.prototype.compileHeightResize = function () {
	this.ratioHeightWeight = this.heightOriginal / this.targetHeight;
	var totalChannels = this.targetWidth * this.targetHeight * 4;
	var totalPrevChannels = this.targetWidth * this.heightOriginal * 4;
	var targetWidthMul = this.targetWidth << 2;
	var toCompile = "\
	var ratioWeight = this.ratioHeightWeight;\
	var weight = 0;\
	var actualPosition = 0;\
	var amountToNext = 0;\
	var outputBuffer = this.heightBuffer;\
	var outputOffset = 0;\
	var currentPosition = 0;\
	var output = this.outputHeightWorkBench;\
	do {\
		weight = ratioWeight;";
	for (pixelOffset = 0; pixelOffset < targetWidthMul; ++pixelOffset) {
		toCompile += "\
		output[" + pixelOffset + "] = 0;";
	}
	toCompile += "\
		while (weight > 0 && actualPosition < " + totalPrevChannels + ") {\
			amountToNext = 1 + actualPosition - currentPosition;\
			if (weight >= amountToNext) {";
	for (pixelOffset = 0; pixelOffset < targetWidthMul; ++pixelOffset) {
		toCompile += "\
				output[" + pixelOffset + "] += buffer[actualPosition++] * amountToNext;";
	}
	toCompile += "\
				currentPosition = actualPosition;\
				weight -= amountToNext;\
			}\
			else {";
	for (pixelOffset = 0; pixelOffset < targetWidthMul; ++pixelOffset) {
		toCompile += "\
				output[" + pixelOffset + "] += buffer[actualPosition" + ((pixelOffset > 0) ? (" + " + pixelOffset) : "") + "] * weight;";
	}
	toCompile += "\
				currentPosition += weight;\
				break;\
			}\
		}";
	for (pixelOffset = 0; pixelOffset < targetWidthMul; ++pixelOffset) {
		toCompile += "\
		outputBuffer[outputOffset++] = output[" + pixelOffset + "] / ratioWeight;";
	}
	toCompile += "\
	} while (outputOffset < " + totalChannels + ");\
	return outputBuffer;";
	this.resizeHeight = Function("buffer", toCompile);
}
Resize.prototype.resizer = function (buffer) {
	return this.resizeHeight(this.resizeWidth(buffer));
}
Resize.prototype.bypassResampler = function (buffer) {
	//Just return the buffer passsed:
	return buffer;
}
Resize.prototype.initializeFirstPassBuffers = function () {
	//Initialize the internal width pass buffers:
	this.heightBuffer = this.generateBuffer(this.targetWidth * this.heightOriginal * 4);
	this.outputWidthWorkBench = this.generateBuffer(this.heightOriginal << 2);
}
Resize.prototype.initializeSecondPassBuffers = function () {
	//Initialize the internal height pass buffers:
	this.heightBuffer = this.generateBuffer(this.targetWidth * this.targetHeight * 4);
	this.outputHeightWorkBench = this.generateBuffer(this.targetWidth << 2);
}
Resize.prototype.generateBuffer = function (bufferLength) {
	//Generate a typed array buffer:
	try {
		return new Float16Array(bufferLength);
	}
	catch (error) {
		try {
			return new Float32Array(bufferLength);
		}
		catch (error) {
			return [];
		}
	}
}