/**
 * Recording state management using Svelte 5 runes
 */

import type { Translations } from '$lib/i18n';

export type RecordingState = 'idle' | 'recording' | 'stopped' | 'processing' | 'ready' | 'error';

export type OutputFormat = 'mp3' | 'aac' | 'opus';

export interface RecordedTracks {
	systemAudio: Blob | null;
	micAudio: Blob | null;
}

export interface ProcessedTracks {
	systemAudio: string | null; // URL
	micAudio: string | null; // URL
	mixedAudio: string | null; // URL
}

export interface ProcessingOptions {
	duckSystemAudio: boolean;
	outputFormat: OutputFormat;
}

// Global state using runes
let state = $state<RecordingState>('idle');
let includeMicrophone = $state(false);
let selectedMicId = $state<string>('');
let recordedTracks = $state<RecordedTracks>({
	systemAudio: null,
	micAudio: null
});
let processedTracks = $state<ProcessedTracks>({
	systemAudio: null,
	micAudio: null,
	mixedAudio: null
});
let processingOptions = $state<ProcessingOptions>({
	duckSystemAudio: false,
	outputFormat: 'mp3'
});
let statusMessage = $state('');
let errorMessage = $state('');
let recordingDuration = $state(0);

// Recording timer
let recordingStartTime: number | null = null;
let durationInterval: ReturnType<typeof setInterval> | null = null;

function startDurationTimer() {
	recordingStartTime = Date.now();
	recordingDuration = 0;
	durationInterval = setInterval(() => {
		if (recordingStartTime) {
			recordingDuration = Math.floor((Date.now() - recordingStartTime) / 1000);
		}
	}, 1000);
}

function stopDurationTimer() {
	if (durationInterval) {
		clearInterval(durationInterval);
		durationInterval = null;
	}
}

export function getRecorderState() {
	return {
		get state() {
			return state;
		},
		set state(value: RecordingState) {
			state = value;
		},

		get includeMicrophone() {
			return includeMicrophone;
		},
		set includeMicrophone(value: boolean) {
			includeMicrophone = value;
		},

		get selectedMicId() {
			return selectedMicId;
		},
		set selectedMicId(value: string) {
			selectedMicId = value;
		},

		get recordedTracks() {
			return recordedTracks;
		},

		get processedTracks() {
			return processedTracks;
		},

		get processingOptions() {
			return processingOptions;
		},

		get statusMessage() {
			return statusMessage;
		},
		set statusMessage(value: string) {
			statusMessage = value;
		},

		get errorMessage() {
			return errorMessage;
		},
		set errorMessage(value: string) {
			errorMessage = value;
		},

		get recordingDuration() {
			return recordingDuration;
		},

		// Derived states
		get isRecording() {
			return state === 'recording';
		},
		get isProcessing() {
			return state === 'processing';
		},
		get canDownload() {
			return state === 'ready';
		},
		get showDuckingOption() {
			return includeMicrophone && (state === 'stopped' || state === 'ready');
		},
		get hasError() {
			return state === 'error';
		},

		// Actions
		startRecording(t: Translations) {
			state = 'recording';
			statusMessage = t.recordingStarted;
			errorMessage = '';
			startDurationTimer();
		},

		stopRecording(system: Blob | null, mic: Blob | null, t: Translations) {
			stopDurationTimer();
			state = 'stopped';
			recordedTracks = {
				systemAudio: system,
				micAudio: mic
			};
			statusMessage = t.recordingStopped;
		},

		setProcessing(t: Translations) {
			state = 'processing';
			statusMessage = t.processingFiles;
		},

		setReady(tracks: ProcessedTracks, t: Translations) {
			processedTracks = tracks;
			state = 'ready';
			statusMessage = t.downloadsReadyStatus;
		},

		setError(message: string) {
			state = 'error';
			errorMessage = message;
			statusMessage = '';
		},

		setDuckSystemAudio(value: boolean) {
			processingOptions = { ...processingOptions, duckSystemAudio: value };
		},

		setOutputFormat(value: OutputFormat) {
			processingOptions = { ...processingOptions, outputFormat: value };
		},

		reset() {
			stopDurationTimer();
			state = 'idle';
			includeMicrophone = false;
			selectedMicId = '';
			recordedTracks = { systemAudio: null, micAudio: null };
			processedTracks = { systemAudio: null, micAudio: null, mixedAudio: null };
			processingOptions = { duckSystemAudio: false, outputFormat: 'mp3' };
			statusMessage = '';
			errorMessage = '';
			recordingDuration = 0;
		},

		// Clean up processed track URLs
		revokeUrls() {
			if (processedTracks.systemAudio) URL.revokeObjectURL(processedTracks.systemAudio);
			if (processedTracks.micAudio) URL.revokeObjectURL(processedTracks.micAudio);
			if (processedTracks.mixedAudio) URL.revokeObjectURL(processedTracks.mixedAudio);
		}
	};
}

// Format duration as MM:SS
export function formatDuration(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
