var XAudioJSBuffer = [];
self.onmessage = function (event) {
	var data = event.data;
	var length = data.length;
	for (var i = 0; i < length; ++i) {
		XAudioJSBuffer.push(data[i]);
	}
	self.postMessage(XAudioJSBuffer.length);
}
self.onprocessmedia = function (event) {
	var len = Math.min(event.audioLength, XAudioJSBuffer.length);
	var output = new Float32Array(event.audioLength);
	for (var i = 0; i < len; ++i) {
		output[i] = XAudioJSBuffer.shift();
	}
	event.writeAudio(output);
	self.postMessage(XAudioJSBuffer.length);
};
