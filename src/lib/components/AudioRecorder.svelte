<script lang="ts">
	import {
		getDisplayMediaStream,
		getMicrophoneStream,
		getAudioInputDevices,
		createRecorder,
		collectChunks,
		stopStream,
		MediaCaptureError,
		type AudioDevice
	} from '$lib/utils/media';
	import { getRecorderState, formatDuration, type OutputFormat } from '$lib/stores/recorder.svelte';

	interface Props {
		onRecordingComplete?: () => void;
	}

	let { onRecordingComplete }: Props = $props();

	const recorder = getRecorderState();

	let audioDevices = $state<AudioDevice[]>([]);
	let devicesLoaded = $state(false);

	// Load audio devices when microphone is enabled
	async function loadAudioDevices() {
		if (devicesLoaded) return;

		// Request permission first to get device labels
		try {
			const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
			tempStream.getTracks().forEach((t) => t.stop());
		} catch {
			// Permission denied - we'll still try to enumerate
		}

		audioDevices = await getAudioInputDevices();
		devicesLoaded = true;

		// Select first device by default if none selected
		if (audioDevices.length > 0 && !recorder.selectedMicId) {
			recorder.selectedMicId = audioDevices[0].deviceId;
		}
	}

	// Load devices when mic checkbox is enabled
	$effect(() => {
		if (recorder.includeMicrophone && !devicesLoaded) {
			loadAudioDevices();
		}
	});

	let systemRecorder: MediaRecorder | null = null;
	let micRecorder: MediaRecorder | null = null;
	let systemStream: MediaStream | null = null;
	let micStream: MediaStream | null = null;
	let systemChunksPromise: Promise<Blob> | null = null;
	let micChunksPromise: Promise<Blob> | null = null;

	async function startRecording() {
		try {
			// Get system audio via screen share
			systemStream = await getDisplayMediaStream();
			systemRecorder = createRecorder(systemStream);
			systemChunksPromise = collectChunks(systemRecorder);

			// Handle stream ending (user stops sharing)
			systemStream.getAudioTracks()[0].onended = () => {
				if (recorder.isRecording) {
					stopRecording();
				}
			};

			// Optionally get microphone
			if (recorder.includeMicrophone) {
				micStream = await getMicrophoneStream(recorder.selectedMicId || undefined);
				micRecorder = createRecorder(micStream);
				micChunksPromise = collectChunks(micRecorder);
				micRecorder.start();
			}

			systemRecorder.start();
			recorder.startRecording();
		} catch (err) {
			if (err instanceof MediaCaptureError) {
				recorder.setError(err.message);
			} else {
				recorder.setError('Failed to start recording. Please try again.');
			}

			// Clean up on error
			stopStream(systemStream);
			stopStream(micStream);
		}
	}

	async function stopRecording() {
		systemRecorder?.stop();
		micRecorder?.stop();

		// Wait for chunks to be collected
		const [systemBlob, micBlob] = await Promise.all([
			systemChunksPromise,
			micChunksPromise || Promise.resolve(null)
		]);

		recorder.stopRecording(systemBlob, micBlob);

		// Stop all tracks
		stopStream(systemStream);
		stopStream(micStream);

		// Reset refs
		systemRecorder = null;
		micRecorder = null;
		systemStream = null;
		micStream = null;
		systemChunksPromise = null;
		micChunksPromise = null;
	}

	async function processAudio() {
		recorder.setProcessing();

		const formData = new FormData();

		const tracks = recorder.recordedTracks;
		if (tracks.systemAudio) {
			formData.append('systemAudio', tracks.systemAudio, 'system.webm');
		}
		if (tracks.micAudio) {
			formData.append('micAudio', tracks.micAudio, 'mic.webm');
		}

		const options = recorder.processingOptions;
		formData.append('duckSystemAudio', String(options.duckSystemAudio));
		formData.append('outputFormat', options.outputFormat);
		formData.append('duration', String(recorder.recordingDuration));

		try {
			const response = await fetch('/api/process', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || 'Processing failed');
			}

			const result = await response.json();

			recorder.setReady({
				systemAudio: result.systemAudioUrl || null,
				micAudio: result.micAudioUrl || null,
				mixedAudio: result.mixedAudioUrl || null
			});

			onRecordingComplete?.();
		} catch (err) {
			const error = err as Error;
			recorder.setError(error.message || 'Processing failed. Please try again.');
		}
	}

	function handleFormatChange(e: Event) {
		const target = e.target as HTMLInputElement;
		recorder.setOutputFormat(target.value as OutputFormat);
	}

	function handleDuckingChange(e: Event) {
		const target = e.target as HTMLInputElement;
		recorder.setDuckSystemAudio(target.checked);
	}

	function handleMicChange(e: Event) {
		const target = e.target as HTMLInputElement;
		recorder.includeMicrophone = target.checked;
	}

	function handleMicSelect(e: Event) {
		const target = e.target as HTMLSelectElement;
		recorder.selectedMicId = target.value;
	}

	function startNewRecording() {
		recorder.revokeUrls();
		recorder.reset();
	}
</script>

<div class="audio-recorder">
	<!-- Status announcer for screen readers -->
	<div role="status" aria-live="polite" aria-atomic="true" class="sr-only">
		{recorder.statusMessage}
	</div>

	<!-- Error display -->
	{#if recorder.hasError}
		<div role="alert" class="error-message">
			{recorder.errorMessage}
			<button type="button" onclick={startNewRecording}>Try again</button>
		</div>
	{/if}

	<!-- Pre-recording controls -->
	{#if recorder.state === 'idle'}
		<div class="controls-section" role="group" aria-label="Recording options">
			<label class="checkbox-label">
				<input
					type="checkbox"
					checked={recorder.includeMicrophone}
					onchange={handleMicChange}
					aria-describedby="mic-hint"
				/>
				Include microphone
			</label>
			<p id="mic-hint" class="hint">
				Enable to record your voice along with system audio
			</p>

			{#if recorder.includeMicrophone && audioDevices.length > 0}
				<div class="mic-select">
					<label for="mic-device">Microphone:</label>
					<select
						id="mic-device"
						value={recorder.selectedMicId}
						onchange={handleMicSelect}
					>
						{#each audioDevices as device}
							<option value={device.deviceId}>{device.label}</option>
						{/each}
					</select>
				</div>
			{/if}

			<button type="button" class="btn btn-record" onclick={startRecording}>
				Start Recording
			</button>
		</div>
	{/if}

	<!-- Recording in progress -->
	{#if recorder.isRecording}
		<div class="recording-section" role="group" aria-label="Recording in progress">
			<div class="recording-indicator" aria-hidden="true">
				<span class="pulse"></span>
				Recording
			</div>

			<p class="duration" aria-live="off">
				Duration: <span aria-label="Recording duration">{formatDuration(recorder.recordingDuration)}</span>
			</p>

			<button type="button" class="btn btn-stop" onclick={stopRecording}>
				Stop Recording
			</button>
		</div>
	{/if}

	<!-- Post-processing options -->
	{#if recorder.state === 'stopped'}
		<div class="postprocess-section" role="group" aria-label="Post-processing options">
			<h3>Post-Processing Options</h3>

			<fieldset>
				<legend>Output format</legend>
				<label>
					<input
						type="radio"
						name="format"
						value="mp3"
						checked={recorder.processingOptions.outputFormat === 'mp3'}
						onchange={handleFormatChange}
					/>
					MP3 <span class="format-desc">(universal compatibility)</span>
				</label>
				<label>
					<input
						type="radio"
						name="format"
						value="aac"
						checked={recorder.processingOptions.outputFormat === 'aac'}
						onchange={handleFormatChange}
					/>
					AAC <span class="format-desc">(better quality/size ratio)</span>
				</label>
				<label>
					<input
						type="radio"
						name="format"
						value="opus"
						checked={recorder.processingOptions.outputFormat === 'opus'}
						onchange={handleFormatChange}
					/>
					Opus/WebM <span class="format-desc">(best quality, limited compatibility)</span>
				</label>
			</fieldset>

			{#if recorder.showDuckingOption}
				<label class="checkbox-label">
					<input
						type="checkbox"
						checked={recorder.processingOptions.duckSystemAudio}
						onchange={handleDuckingChange}
						aria-describedby="duck-hint"
					/>
					Duck system audio while speaking
				</label>
				<p id="duck-hint" class="hint">
					Automatically lower system audio volume when your microphone detects speech
				</p>
			{/if}

			<div class="button-group">
				<button type="button" class="btn btn-primary" onclick={processAudio}>
					Process Audio
				</button>
				<button type="button" class="btn btn-secondary" onclick={startNewRecording}>
					Start Over
				</button>
			</div>
		</div>
	{/if}

	<!-- Processing indicator -->
	{#if recorder.isProcessing}
		<div class="processing-section" role="alert" aria-busy="true">
			<div class="spinner" aria-hidden="true"></div>
			<p>Processing audio files...</p>
			<p class="hint">This may take a moment for longer recordings.</p>
		</div>
	{/if}

	<!-- Downloads ready -->
	{#if recorder.canDownload}
		<div class="downloads-section" role="group" aria-label="Download options">
			<h3>Downloads Ready</h3>

			<div class="download-buttons">
				{#if recorder.processedTracks.systemAudio}
					<a
						href={recorder.processedTracks.systemAudio}
						download="system-audio.{recorder.processingOptions.outputFormat === 'aac' ? 'm4a' : recorder.processingOptions.outputFormat}"
						class="btn btn-download"
					>
						Download System Audio
					</a>
				{/if}

				{#if recorder.processedTracks.micAudio}
					<a
						href={recorder.processedTracks.micAudio}
						download="microphone.{recorder.processingOptions.outputFormat === 'aac' ? 'm4a' : recorder.processingOptions.outputFormat}"
						class="btn btn-download"
					>
						Download Microphone
					</a>
				{/if}

				{#if recorder.processedTracks.mixedAudio}
					<a
						href={recorder.processedTracks.mixedAudio}
						download="mixed.{recorder.processingOptions.outputFormat === 'aac' ? 'm4a' : recorder.processingOptions.outputFormat}"
						class="btn btn-download"
					>
						Download Mixed Track
					</a>
				{/if}
			</div>

			<button type="button" class="btn btn-secondary" onclick={startNewRecording}>
				Record Another
			</button>
		</div>
	{/if}
</div>

<style>
	.audio-recorder {
		max-width: 600px;
		margin: 0 auto;
		padding: 1.5rem;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.controls-section,
	.recording-section,
	.postprocess-section,
	.processing-section,
	.downloads-section {
		padding: 1.5rem;
		border: 1px solid #ddd;
		border-radius: 8px;
		background: #fafafa;
	}

	.error-message {
		padding: 1rem;
		margin-bottom: 1rem;
		background: #fee;
		border: 1px solid #c00;
		border-radius: 4px;
		color: #900;
	}

	.error-message button {
		margin-top: 0.5rem;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		margin-bottom: 0.25rem;
	}

	.checkbox-label input[type="checkbox"] {
		width: 1.25rem;
		height: 1.25rem;
	}

	.hint {
		font-size: 0.875rem;
		color: #666;
		margin: 0.25rem 0 1rem 1.75rem;
	}

	.mic-select {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.mic-select label {
		font-weight: 500;
	}

	.mic-select select {
		flex: 1;
		padding: 0.5rem;
		font-size: 0.875rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: white;
		max-width: 300px;
	}

	.btn {
		display: inline-block;
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		font-weight: 500;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		text-decoration: none;
		text-align: center;
		transition: background-color 0.2s;
	}

	.btn-record {
		background: #c00;
		color: white;
	}

	.btn-record:hover {
		background: #a00;
	}

	.btn-stop {
		background: #333;
		color: white;
	}

	.btn-stop:hover {
		background: #111;
	}

	.btn-primary {
		background: #007bff;
		color: white;
	}

	.btn-primary:hover {
		background: #0056b3;
	}

	.btn-secondary {
		background: #6c757d;
		color: white;
	}

	.btn-secondary:hover {
		background: #545b62;
	}

	.btn-download {
		background: #28a745;
		color: white;
	}

	.btn-download:hover {
		background: #1e7e34;
	}

	.recording-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.25rem;
		font-weight: 600;
		color: #c00;
		margin-bottom: 1rem;
	}

	.pulse {
		width: 12px;
		height: 12px;
		background: #c00;
		border-radius: 50%;
		animation: pulse 1s infinite;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.5;
			transform: scale(1.2);
		}
	}

	.duration {
		font-size: 2rem;
		font-family: monospace;
		margin: 1rem 0;
	}

	fieldset {
		border: 1px solid #ccc;
		border-radius: 4px;
		padding: 1rem;
		margin-bottom: 1rem;
	}

	legend {
		font-weight: 600;
		padding: 0 0.5rem;
	}

	fieldset label {
		display: block;
		padding: 0.5rem 0;
		cursor: pointer;
	}

	fieldset input[type="radio"] {
		margin-right: 0.5rem;
	}

	.format-desc {
		font-size: 0.875rem;
		color: #666;
	}

	.button-group {
		display: flex;
		gap: 1rem;
		margin-top: 1rem;
	}

	.processing-section {
		text-align: center;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 4px solid #ddd;
		border-top-color: #007bff;
		border-radius: 50%;
		margin: 0 auto 1rem;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.downloads-section h3 {
		margin-top: 0;
		margin-bottom: 1rem;
	}

	.download-buttons {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.postprocess-section h3 {
		margin-top: 0;
		margin-bottom: 1rem;
	}
</style>
