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
	import { getRecorderState, formatDuration, type OutputFormat, type MicEffects } from '$lib/stores/recorder.svelte';
	import { getLanguageState } from '$lib/i18n/index.svelte';

	interface Props {
		onRecordingComplete?: () => void;
	}

	let { onRecordingComplete }: Props = $props();

	const recorder = getRecorderState();
	const i18n = getLanguageState();

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

	// Mic preview state
	let isPreviewing = $state(false);
	let previewStream: MediaStream | null = null;
	let previewAudioContext: AudioContext | null = null;
	let previewSource: MediaStreamAudioSourceNode | null = null;

	// Audio nodes that can be updated in real-time
	let previewNodes: {
		highpass: BiquadFilterNode | null;
		noiseGate: DynamicsCompressorNode | null;
		boost: GainNode | null;
		compressor: DynamicsCompressorNode | null;
		reverbInput: GainNode | null;
		reverbOutput: GainNode | null;
		reverbDry: GainNode | null;
		reverbWet: GainNode | null;
		reverbDelays: DelayNode[];
		reverbGains: GainNode[];
		reverbFilter: BiquadFilterNode | null;
	} = {
		highpass: null,
		noiseGate: null,
		boost: null,
		compressor: null,
		reverbInput: null,
		reverbOutput: null,
		reverbDry: null,
		reverbWet: null,
		reverbDelays: [],
		reverbGains: [],
		reverbFilter: null
	};

	async function toggleMicPreview() {
		if (isPreviewing) {
			stopMicPreview();
		} else {
			await startMicPreview();
		}
	}

	async function startMicPreview() {
		try {
			previewStream = await getMicrophoneStream(recorder.selectedMicId || undefined);
			previewAudioContext = new AudioContext();

			previewSource = previewAudioContext.createMediaStreamSource(previewStream);

			// Create all nodes (we'll connect/disconnect based on effects)
			previewNodes.highpass = previewAudioContext.createBiquadFilter();
			previewNodes.highpass.type = 'highpass';
			previewNodes.highpass.frequency.value = 80;

			previewNodes.noiseGate = previewAudioContext.createDynamicsCompressor();
			previewNodes.noiseGate.threshold.value = -50;
			previewNodes.noiseGate.knee.value = 0;
			previewNodes.noiseGate.ratio.value = 20;
			previewNodes.noiseGate.attack.value = 0.003;
			previewNodes.noiseGate.release.value = 0.1;

			previewNodes.boost = previewAudioContext.createGain();

			previewNodes.compressor = previewAudioContext.createDynamicsCompressor();
			previewNodes.compressor.threshold.value = -24;
			previewNodes.compressor.knee.value = 30;
			previewNodes.compressor.ratio.value = 4;
			previewNodes.compressor.attack.value = 0.003;
			previewNodes.compressor.release.value = 0.25;

			// Multi-tap reverb using parallel delays with prime-ratio times
			previewNodes.reverbInput = previewAudioContext.createGain();
			previewNodes.reverbOutput = previewAudioContext.createGain();
			previewNodes.reverbDry = previewAudioContext.createGain();
			previewNodes.reverbWet = previewAudioContext.createGain();

			// Lowpass filter to simulate high-frequency absorption
			previewNodes.reverbFilter = previewAudioContext.createBiquadFilter();
			previewNodes.reverbFilter.type = 'lowpass';
			previewNodes.reverbFilter.frequency.value = 4000;

			// Create multiple delay taps at different times for diffuse reflections
			const delayTimes = [0.029, 0.041, 0.053, 0.067, 0.083, 0.097, 0.113, 0.127];
			const gains = [0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3];

			previewNodes.reverbDelays = [];
			previewNodes.reverbGains = [];

			for (let i = 0; i < delayTimes.length; i++) {
				const delay = previewAudioContext.createDelay();
				delay.delayTime.value = delayTimes[i];

				const gain = previewAudioContext.createGain();
				gain.gain.value = gains[i];

				previewNodes.reverbDelays.push(delay);
				previewNodes.reverbGains.push(gain);
			}

			rebuildPreviewChain();
			isPreviewing = true;
		} catch (err) {
			console.error('Failed to start mic preview:', err);
			stopMicPreview();
		}
	}

	function rebuildPreviewChain() {
		if (!previewAudioContext || !previewSource) return;

		// Disconnect all nodes
		previewSource.disconnect();
		previewNodes.highpass?.disconnect();
		previewNodes.noiseGate?.disconnect();
		previewNodes.boost?.disconnect();
		previewNodes.compressor?.disconnect();
		previewNodes.reverbInput?.disconnect();
		previewNodes.reverbOutput?.disconnect();
		previewNodes.reverbDry?.disconnect();
		previewNodes.reverbWet?.disconnect();
		previewNodes.reverbFilter?.disconnect();
		previewNodes.reverbDelays.forEach((d) => d.disconnect());
		previewNodes.reverbGains.forEach((g) => g.disconnect());

		const effects = recorder.processingOptions.micEffects;
		let currentNode: AudioNode = previewSource;

		// High-pass filter (removes low rumble)
		if (effects.highpass && previewNodes.highpass) {
			currentNode.connect(previewNodes.highpass);
			currentNode = previewNodes.highpass;
		}

		// Noise gate
		if (effects.noiseGate && previewNodes.noiseGate) {
			currentNode.connect(previewNodes.noiseGate);
			currentNode = previewNodes.noiseGate;
		}

		// Boost (only if gain > 1.0)
		if (effects.boost > 1.0 && previewNodes.boost) {
			previewNodes.boost.gain.value = effects.boost;
			currentNode.connect(previewNodes.boost);
			currentNode = previewNodes.boost;
		}

		// Compressor (normalize levels)
		if (effects.compressor && previewNodes.compressor) {
			currentNode.connect(previewNodes.compressor);
			currentNode = previewNodes.compressor;
		}

		// Reverb (multi-tap delay network)
		if (
			effects.echo &&
			previewNodes.reverbInput &&
			previewNodes.reverbOutput &&
			previewNodes.reverbDry &&
			previewNodes.reverbWet &&
			previewNodes.reverbFilter
		) {
			previewNodes.reverbDry.gain.value = 0.7;
			previewNodes.reverbWet.gain.value = 0.5;

			// Dry path
			currentNode.connect(previewNodes.reverbDry);
			previewNodes.reverbDry.connect(previewAudioContext.destination);

			// Wet path: input -> parallel delays -> filter -> wet gain -> output
			currentNode.connect(previewNodes.reverbInput);

			for (let i = 0; i < previewNodes.reverbDelays.length; i++) {
				previewNodes.reverbInput.connect(previewNodes.reverbDelays[i]);
				previewNodes.reverbDelays[i].connect(previewNodes.reverbGains[i]);
				previewNodes.reverbGains[i].connect(previewNodes.reverbOutput);
			}

			previewNodes.reverbOutput.connect(previewNodes.reverbFilter);
			previewNodes.reverbFilter.connect(previewNodes.reverbWet);
			previewNodes.reverbWet.connect(previewAudioContext.destination);
			return;
		}

		currentNode.connect(previewAudioContext.destination);
	}

	function stopMicPreview() {
		if (previewStream) {
			previewStream.getTracks().forEach((t) => t.stop());
			previewStream = null;
		}
		if (previewAudioContext) {
			previewAudioContext.close();
			previewAudioContext = null;
		}
		previewSource = null;
		previewNodes = {
			highpass: null,
			noiseGate: null,
			boost: null,
			compressor: null,
			reverbInput: null,
			reverbOutput: null,
			reverbDry: null,
			reverbWet: null,
			reverbDelays: [],
			reverbGains: [],
			reverbFilter: null
		};
		isPreviewing = false;
	}

	// Update preview when effects change
	$effect(() => {
		// Access all effect values to track them
		const effects = recorder.processingOptions.micEffects;
		void effects.boost;
		void effects.noiseGate;
		void effects.echo;
		void effects.highpass;
		void effects.compressor;

		if (isPreviewing) {
			rebuildPreviewChain();
		}
	});

	// Restart preview when mic device changes
	let lastPreviewMicId: string | null = null;
	$effect(() => {
		const micId = recorder.selectedMicId;
		if (isPreviewing && micId && lastPreviewMicId !== null && micId !== lastPreviewMicId) {
			stopMicPreview();
			startMicPreview();
		}
		if (isPreviewing) {
			lastPreviewMicId = micId;
		}
	});

	// Stop preview when mic is disabled or component unmounts
	$effect(() => {
		if (!recorder.includeMicrophone && isPreviewing) {
			stopMicPreview();
		}
		return () => stopMicPreview();
	});

	async function startRecording() {
		// Stop any active preview
		if (isPreviewing) {
			stopMicPreview();
		}

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
			recorder.startRecording(i18n.t);
		} catch (err) {
			if (err instanceof MediaCaptureError) {
				recorder.setError(err.message);
			} else {
				recorder.setError(i18n.t.failedToStartRecording);
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

		recorder.stopRecording(systemBlob, micBlob, i18n.t);

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
		recorder.setProcessing(i18n.t);

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
		formData.append('micBoost', String(options.micEffects.boost));
		formData.append('micNoiseGate', String(options.micEffects.noiseGate));
		formData.append('micEcho', String(options.micEffects.echo));
		formData.append('micHighpass', String(options.micEffects.highpass));
		formData.append('micCompressor', String(options.micEffects.compressor));

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
			}, i18n.t);

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

	function handleMicEffectChange(effect: keyof MicEffects) {
		return (e: Event) => {
			const target = e.target as HTMLInputElement;
			recorder.setMicEffect(effect, target.checked as MicEffects[typeof effect]);
		};
	}

	function handleBoostToggle(e: Event) {
		const target = e.target as HTMLInputElement;
		recorder.setMicEffect('boost', target.checked ? 1.5 : 1.0);
	}

	function handleBoostChange(e: Event) {
		const target = e.target as HTMLInputElement;
		recorder.setMicEffect('boost', parseFloat(target.value));
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
			<button type="button" onclick={startNewRecording}>{i18n.t.tryAgain}</button>
		</div>
	{/if}

	<!-- Pre-recording controls -->
	{#if recorder.state === 'idle'}
		<div class="controls-section" role="group" aria-label={i18n.t.recordingOptions}>
			<label class="checkbox-label">
				<input
					type="checkbox"
					checked={recorder.includeMicrophone}
					onchange={handleMicChange}
					aria-describedby="mic-hint"
				/>
				{i18n.t.includeMicrophone}
			</label>
			<p id="mic-hint" class="hint">
				{i18n.t.microphoneHint}
			</p>

			{#if recorder.includeMicrophone && audioDevices.length > 0}
				<div class="mic-select">
					<label for="mic-device">{i18n.t.microphoneLabel}</label>
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

				<fieldset class="mic-effects">
					<legend>{i18n.t.micEffects}</legend>

					<div class="effect-row">
						<label class="checkbox-label">
							<input
								type="checkbox"
								checked={recorder.processingOptions.micEffects.boost > 1.0}
								onchange={handleBoostToggle}
								aria-describedby="boost-hint-pre"
							/>
							{i18n.t.micBoost}
						</label>
						{#if recorder.processingOptions.micEffects.boost > 1.0}
							<div class="slider-row">
								<input
									type="range"
									min="1.1"
									max="3.0"
									step="0.1"
									value={recorder.processingOptions.micEffects.boost}
									oninput={handleBoostChange}
									aria-label={i18n.t.micBoost}
								/>
								<span class="slider-value">{recorder.processingOptions.micEffects.boost.toFixed(1)}x</span>
							</div>
						{/if}
					</div>
					<p id="boost-hint-pre" class="hint">
						{i18n.t.micBoostHint}
					</p>

					<label class="checkbox-label">
						<input
							type="checkbox"
							checked={recorder.processingOptions.micEffects.highpass}
							onchange={handleMicEffectChange('highpass')}
							aria-describedby="highpass-hint-pre"
						/>
						{i18n.t.micHighpass}
					</label>
					<p id="highpass-hint-pre" class="hint">
						{i18n.t.micHighpassHint}
					</p>

					<label class="checkbox-label">
						<input
							type="checkbox"
							checked={recorder.processingOptions.micEffects.noiseGate}
							onchange={handleMicEffectChange('noiseGate')}
							aria-describedby="gate-hint-pre"
						/>
						{i18n.t.micNoiseGate}
					</label>
					<p id="gate-hint-pre" class="hint">
						{i18n.t.micNoiseGateHint}
					</p>

					<label class="checkbox-label">
						<input
							type="checkbox"
							checked={recorder.processingOptions.micEffects.compressor}
							onchange={handleMicEffectChange('compressor')}
							aria-describedby="compressor-hint-pre"
						/>
						{i18n.t.micCompressor}
					</label>
					<p id="compressor-hint-pre" class="hint">
						{i18n.t.micCompressorHint}
					</p>

					<label class="checkbox-label">
						<input
							type="checkbox"
							checked={recorder.processingOptions.micEffects.echo}
							onchange={handleMicEffectChange('echo')}
							aria-describedby="echo-hint-pre"
						/>
						{i18n.t.micEcho}
					</label>
					<p id="echo-hint-pre" class="hint">
						{i18n.t.micEchoHint}
					</p>
				</fieldset>

				<button
					type="button"
					class="btn btn-preview"
					class:active={isPreviewing}
					aria-pressed={isPreviewing}
					onclick={toggleMicPreview}
				>
					{i18n.t.previewMicrophone}
				</button>
			{/if}

			<button type="button" class="btn btn-record" onclick={startRecording}>
				{i18n.t.startRecording}
			</button>
		</div>
	{/if}

	<!-- Recording in progress -->
	{#if recorder.isRecording}
		<div class="recording-section" role="group" aria-label={i18n.t.recordingInProgress}>
			<div class="recording-indicator" aria-hidden="true">
				<span class="pulse"></span>
				{i18n.t.recording}
			</div>

			<p class="duration" aria-live="off">
				{i18n.t.duration} <span aria-label={i18n.t.recordingDuration}>{formatDuration(recorder.recordingDuration)}</span>
			</p>

			<button type="button" class="btn btn-stop" onclick={stopRecording}>
				{i18n.t.stopRecording}
			</button>
		</div>
	{/if}

	<!-- Post-processing options -->
	{#if recorder.state === 'stopped'}
		<div class="postprocess-section" role="group" aria-label={i18n.t.postProcessingOptions}>
			<h3>{i18n.t.postProcessingOptions}</h3>

			<fieldset>
				<legend>{i18n.t.outputFormat}</legend>
				<label>
					<input
						type="radio"
						name="format"
						value="mp3"
						checked={recorder.processingOptions.outputFormat === 'mp3'}
						onchange={handleFormatChange}
					/>
					{i18n.t.mp3} <span class="format-desc">({i18n.t.mp3Desc})</span>
				</label>
				<label>
					<input
						type="radio"
						name="format"
						value="aac"
						checked={recorder.processingOptions.outputFormat === 'aac'}
						onchange={handleFormatChange}
					/>
					{i18n.t.aac} <span class="format-desc">({i18n.t.aacDesc})</span>
				</label>
				<label>
					<input
						type="radio"
						name="format"
						value="opus"
						checked={recorder.processingOptions.outputFormat === 'opus'}
						onchange={handleFormatChange}
					/>
					{i18n.t.opus} <span class="format-desc">({i18n.t.opusDesc})</span>
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
					{i18n.t.duckSystemAudio}
				</label>
				<p id="duck-hint" class="hint">
					{i18n.t.duckHint}
				</p>

				<fieldset class="mic-effects">
					<legend>{i18n.t.micEffects}</legend>

					<div class="effect-row">
						<label class="checkbox-label">
							<input
								type="checkbox"
								checked={recorder.processingOptions.micEffects.boost > 1.0}
								onchange={handleBoostToggle}
								aria-describedby="boost-hint"
							/>
							{i18n.t.micBoost}
						</label>
						{#if recorder.processingOptions.micEffects.boost > 1.0}
							<div class="slider-row">
								<input
									type="range"
									min="1.1"
									max="3.0"
									step="0.1"
									value={recorder.processingOptions.micEffects.boost}
									oninput={handleBoostChange}
									aria-label={i18n.t.micBoost}
								/>
								<span class="slider-value">{recorder.processingOptions.micEffects.boost.toFixed(1)}x</span>
							</div>
						{/if}
					</div>
					<p id="boost-hint" class="hint">
						{i18n.t.micBoostHint}
					</p>

					<label class="checkbox-label">
						<input
							type="checkbox"
							checked={recorder.processingOptions.micEffects.highpass}
							onchange={handleMicEffectChange('highpass')}
							aria-describedby="highpass-hint"
						/>
						{i18n.t.micHighpass}
					</label>
					<p id="highpass-hint" class="hint">
						{i18n.t.micHighpassHint}
					</p>

					<label class="checkbox-label">
						<input
							type="checkbox"
							checked={recorder.processingOptions.micEffects.noiseGate}
							onchange={handleMicEffectChange('noiseGate')}
							aria-describedby="gate-hint"
						/>
						{i18n.t.micNoiseGate}
					</label>
					<p id="gate-hint" class="hint">
						{i18n.t.micNoiseGateHint}
					</p>

					<label class="checkbox-label">
						<input
							type="checkbox"
							checked={recorder.processingOptions.micEffects.compressor}
							onchange={handleMicEffectChange('compressor')}
							aria-describedby="compressor-hint"
						/>
						{i18n.t.micCompressor}
					</label>
					<p id="compressor-hint" class="hint">
						{i18n.t.micCompressorHint}
					</p>

					<label class="checkbox-label">
						<input
							type="checkbox"
							checked={recorder.processingOptions.micEffects.echo}
							onchange={handleMicEffectChange('echo')}
							aria-describedby="echo-hint"
						/>
						{i18n.t.micEcho}
					</label>
					<p id="echo-hint" class="hint">
						{i18n.t.micEchoHint}
					</p>
				</fieldset>
			{/if}

			<div class="button-group">
				<button type="button" class="btn btn-primary" onclick={processAudio}>
					{i18n.t.processAudio}
				</button>
				<button type="button" class="btn btn-secondary" onclick={startNewRecording}>
					{i18n.t.startOver}
				</button>
			</div>
		</div>
	{/if}

	<!-- Processing indicator -->
	{#if recorder.isProcessing}
		<div class="processing-section" role="alert" aria-busy="true">
			<div class="spinner" aria-hidden="true"></div>
			<p>{i18n.t.processingAudio}</p>
			<p class="hint">{i18n.t.processingHint}</p>
		</div>
	{/if}

	<!-- Downloads ready -->
	{#if recorder.canDownload}
		<div class="downloads-section" role="group" aria-label={i18n.t.downloadOptions}>
			<h3>{i18n.t.downloadsReady}</h3>

			<div class="download-buttons">
				{#if recorder.processedTracks.systemAudio}
					<a
						href={recorder.processedTracks.systemAudio}
						download="system-audio.{recorder.processingOptions.outputFormat === 'aac' ? 'm4a' : recorder.processingOptions.outputFormat}"
						class="btn btn-download"
					>
						{i18n.t.downloadSystemAudio}
					</a>
				{/if}

				{#if recorder.processedTracks.micAudio}
					<a
						href={recorder.processedTracks.micAudio}
						download="microphone.{recorder.processingOptions.outputFormat === 'aac' ? 'm4a' : recorder.processingOptions.outputFormat}"
						class="btn btn-download"
					>
						{i18n.t.downloadMicrophone}
					</a>
				{/if}

				{#if recorder.processedTracks.mixedAudio}
					<a
						href={recorder.processedTracks.mixedAudio}
						download="mixed.{recorder.processingOptions.outputFormat === 'aac' ? 'm4a' : recorder.processingOptions.outputFormat}"
						class="btn btn-download"
					>
						{i18n.t.downloadMixedTrack}
					</a>
				{/if}
			</div>

			<button type="button" class="btn btn-secondary" onclick={startNewRecording}>
				{i18n.t.recordAnother}
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

	.btn-preview {
		background: #6c757d;
		color: white;
		margin-bottom: 1rem;
	}

	.btn-preview:hover {
		background: #545b62;
	}

	.btn-preview.active {
		background: #28a745;
	}

	.btn-preview.active:hover {
		background: #1e7e34;
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

	.mic-effects {
		margin-top: 1rem;
	}

	.mic-effects .checkbox-label {
		margin-bottom: 0;
	}

	.mic-effects .hint {
		margin-bottom: 0.75rem;
	}

	.mic-effects .hint:last-child {
		margin-bottom: 0;
	}

	.effect-row {
		margin-bottom: 0;
	}

	.slider-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 0.5rem 0 0 1.75rem;
	}

	.slider-row input[type="range"] {
		flex: 1;
		max-width: 200px;
		height: 6px;
		-webkit-appearance: none;
		appearance: none;
		background: #ddd;
		border-radius: 3px;
		outline: none;
	}

	.slider-row input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 18px;
		height: 18px;
		background: #007bff;
		border-radius: 50%;
		cursor: pointer;
	}

	.slider-row input[type="range"]::-moz-range-thumb {
		width: 18px;
		height: 18px;
		background: #007bff;
		border-radius: 50%;
		cursor: pointer;
		border: none;
	}

	.slider-value {
		font-size: 0.875rem;
		font-weight: 500;
		color: #333;
		min-width: 3rem;
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
