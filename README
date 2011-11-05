<h1>XAudioJS</h1>
<h3>A minimal cross-browser API for writing PCM audio samples without plugins:</h3>
<p>This API was originally conceived as part of the JavaScript GameBoy Color emulator handling audio support for various browsers.
Since Firefox 4.0 only had the Mozilla Audio Data API and experimental (at the time) WebKit browsers utilized the Web Audio API, 
there instantly was a need for abstracting the two APIs. This simple JavaScript library abstracts the push-for-audio API of Mozilla Audio
and the passive callback API of Web Audio and introduces an abstraction layers that provides a push-for-audio and a callback API in one.</p>
<br>
<p>The underlying audio buffer for mozilla audio is maintained by the browser itself, while for web audio a JavaScript-side ring-buffer is implemented for the audio buffer.</p>
<br>
<h3>How To Initialize:</h3>
<dl>
	<dt>new XAudioServer(int channels, int sampleRate, int bufferLow, int bufferHigh, function underRunCallback, defaultNeutralLevel);</dt>
		<dd>Make sure only one instance of XAudioServer is running at any time.</dd>
		<dd>bufferLow MUST be less than bufferHigh.</dd>
		<dd>
			<dl>
				<dt>Array underRunCallback (int samplesRequested)</dt>
					<dd>Arguments: Passed the number of samples that are needed to replenish the internal audio buffer back to bufferLow.</dd>
					<dd>Functionality: JS developer set callback that can pass back any number of samples to replenish the audio buffer with.
					The return array length DOES NOT NEED to be of length samplesRequested.</dd>
					<dd>Return: Array of samples to be passed into the underlying audio buffer. MUST be divisible by number of channels used (Whole frames required.).</dd>
			</dl>
		</dd>
</dl>
<h3>Function Reference:</h3>
<dl>
	<dt>void writeAudio (Array buffer)</dt>
		<dd>Arguments: Pass an array of audio samples that is divisible by the number of audio channels utilized (buffer % channels == 0).</dd>
		<dd>Functionality: Passes the audio samples directly into the underlying audio subsystem, and can call the specified sample buffer under-run callback as needed.</dd>
		<dd>Return: void (None).</dd>
	<dt>int remainingBuffer (void)</dt>
		<dd>Arguments: void (None).</dd>
		<dd>Functionality: Returns the number of samples left in the audio system before running out of playable samples.</dd>
		<dd>Return: int samples_remaining</dd>
	<dt>void executeCallback (void)</dt>
		<dd>Arguments: void (None).</dd>
		<dd>Functionality: Executes the audio sample under-run callback if the samples remaining is below the set buffer low limit.</dd>
		<dd>Return: void (None).</dd>
</dl>