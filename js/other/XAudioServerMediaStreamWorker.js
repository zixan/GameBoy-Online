var XAudioJSResampledBuffer = [];
var output = [];
var XAudioJSResampleBufferStart = 0;
var XAudioJSResampleBufferEnd = 0;
var XAudioJSResampleBufferSize = 0;
var XAudioJSChannelsAllocated = 1;
var XAudioJSCallbackBufferSize = 0;
self.onmessage = function (event) {
	var data = event.data;
	switch (data[0]) {
		case 0:
			//Add new audio samples:
			var resampledResult = data[1];
			var length = resampledResult.length;
			for (var i = 0; i < length; ++i) {
				XAudioJSResampledBuffer[XAudioJSResampleBufferEnd++] = resampledResult[i];
				if (XAudioJSResampleBufferEnd == XAudioJSResampleBufferSize) {
					XAudioJSResampleBufferEnd = 0;
				}
				if (XAudioJSResampleBufferStart == XAudioJSResampleBufferEnd) {
					XAudioJSResampleBufferStart += XAudioJSChannelsAllocated;
					if (XAudioJSResampleBufferStart == XAudioJSResampleBufferSize) {
						XAudioJSResampleBufferStart = 0;
					}
				}
			}
			break;
		case 1:
			//Initialize:
			XAudioJSResampleBufferSize = data[1];
			XAudioJSChannelsAllocated = data[2];
			XAudioJSCallbackBufferSize = XAudioJSChannelsAllocated * data[3];
			XAudioJSResampleBufferSize += XAudioJSCallbackBufferSize;
			XAudioJSResampledBuffer = new Float32Array(XAudioJSResampleBufferSize);
	}
	XAudioJSMaintainBufferMinimum();
}
self.onprocessmedia = function (event) {
	var apiBufferLength = event.audioLength;
	var apiBufferLengthAll = apiBufferLength * XAudioJSChannelsAllocated;
	if (apiBufferLengthAll > output.length) {
		output = new Float32Array(apiBufferLengthAll);
	}
	var channelOffset = 0;
	for (var i = 0; i < apiBufferLength; ++i) {
		for (channelOffset = i; channelOffset < apiBufferLengthAll; channelOffset += apiBufferLength) {
			output[channelOffset] = XAudioJSGetSample();
		}
	}
	event.writeAudio(output.subarray(0, apiBufferLengthAll));
	self.postMessage(event.audioLength);
	XAudioJSMaintainBufferMinimum();
}
function XAudioJSGetSample() {
	var sample = 0;
	if (XAudioJSResampleBufferStart != XAudioJSResampleBufferEnd) {
		sample = XAudioJSResampledBuffer[XAudioJSResampleBufferStart++];
		if (XAudioJSResampleBufferStart == XAudioJSResampleBufferSize) {
			XAudioJSResampleBufferStart = 0;
		}
	}
	return sample;
}
function XAudioJSResampledSamplesLeft() {
	return ((XAudioJSResampleBufferStart <= XAudioJSResampleBufferEnd) ? 0 : XAudioJSResampleBufferSize) + XAudioJSResampleBufferEnd - XAudioJSResampleBufferStart;
}
function XAudioJSMaintainBufferMinimum() {
	if (XAudioJSResampledSamplesLeft() < XAudioJSCallbackBufferSize) {
		self.postMessage(XAudioJSCallbackBufferSize - XAudioJSResampledSamplesLeft());
	}
}