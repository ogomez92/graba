/**
 * Media capture utilities for high-quality audio recording
 */

export type MediaError =
	| 'NO_AUDIO_TRACK'
	| 'CODEC_NOT_SUPPORTED'
	| 'PERMISSION_DENIED'
	| 'NO_DEVICE'
	| 'UNKNOWN';

export class MediaCaptureError extends Error {
	constructor(
		public code: MediaError,
		message: string
	) {
		super(message);
		this.name = 'MediaCaptureError';
	}
}

/**
 * Display media constraints for capturing screen/tab audio
 * Video is required by the API but we immediately discard it
 */
const DISPLAY_MEDIA_CONSTRAINTS: DisplayMediaStreamOptions = {
	video: true,
	audio: {
		channelCount: 2,
		sampleRate: 48000,
		echoCancellation: false,
		noiseSuppression: false,
		autoGainControl: false
	}
};

/**
 * User media constraints for microphone capture
 */
function getUserMediaConstraints(deviceId?: string): MediaStreamConstraints {
	return {
		video: false,
		audio: {
			deviceId: deviceId ? { exact: deviceId } : undefined,
			channelCount: 2,
			sampleRate: 48000,
			echoCancellation: true,
			noiseSuppression: true,
			autoGainControl: false
		}
	};
}

/**
 * Audio input device info
 */
export interface AudioDevice {
	deviceId: string;
	label: string;
}

/**
 * Get list of available audio input devices (microphones)
 * Note: Labels may be empty until permission is granted
 */
export async function getAudioInputDevices(): Promise<AudioDevice[]> {
	try {
		const devices = await navigator.mediaDevices.enumerateDevices();
		return devices
			.filter((device) => device.kind === 'audioinput')
			.map((device, index) => ({
				deviceId: device.deviceId,
				label: device.label || `Microphone ${index + 1}`
			}));
	} catch {
		return [];
	}
}

/**
 * Codec priority list for MediaRecorder
 */
const CODEC_PRIORITY = [
	'audio/webm;codecs=opus',
	'audio/webm',
	'audio/ogg;codecs=opus',
	'audio/mp4'
];

/**
 * Get the best supported codec for MediaRecorder
 */
export function getSupportedMimeType(): string {
	const supported = CODEC_PRIORITY.find((codec) => MediaRecorder.isTypeSupported(codec));

	if (!supported) {
		throw new MediaCaptureError(
			'CODEC_NOT_SUPPORTED',
			'No supported audio codec found. Please use a modern browser.'
		);
	}

	return supported;
}

/**
 * Get optimal MediaRecorder options
 */
export function getRecorderOptions(): MediaRecorderOptions {
	return {
		mimeType: getSupportedMimeType(),
		audioBitsPerSecond: 320000 // 320kbps stereo for maximum quality
	};
}

/**
 * Request screen/tab sharing and extract audio stream
 * @throws MediaCaptureError if permission denied or no audio available
 */
export async function getDisplayMediaStream(): Promise<MediaStream> {
	try {
		const stream = await navigator.mediaDevices.getDisplayMedia(DISPLAY_MEDIA_CONSTRAINTS);

		// Stop video tracks immediately - we only need audio
		stream.getVideoTracks().forEach((track) => track.stop());

		const audioTracks = stream.getAudioTracks();

		if (audioTracks.length === 0) {
			throw new MediaCaptureError(
				'NO_AUDIO_TRACK',
				'No audio available. Please share a browser tab or window with audio enabled.'
			);
		}

		return new MediaStream(audioTracks);
	} catch (err) {
		if (err instanceof MediaCaptureError) {
			throw err;
		}

		const error = err as Error;

		if (error.name === 'NotAllowedError') {
			throw new MediaCaptureError(
				'PERMISSION_DENIED',
				'Permission denied. Please allow screen sharing to record.'
			);
		}

		throw new MediaCaptureError('UNKNOWN', error.message || 'Failed to capture screen audio');
	}
}

/**
 * Request microphone access
 * @param deviceId - Optional specific device ID to use
 * @throws MediaCaptureError if permission denied or no device found
 */
export async function getMicrophoneStream(deviceId?: string): Promise<MediaStream> {
	try {
		return await navigator.mediaDevices.getUserMedia(getUserMediaConstraints(deviceId));
	} catch (err) {
		const error = err as Error;

		if (error.name === 'NotAllowedError') {
			throw new MediaCaptureError(
				'PERMISSION_DENIED',
				'Microphone permission denied. Please allow microphone access.'
			);
		}

		if (error.name === 'NotFoundError') {
			throw new MediaCaptureError('NO_DEVICE', 'No microphone found.');
		}

		throw new MediaCaptureError('UNKNOWN', error.message || 'Failed to access microphone');
	}
}

/**
 * Create a MediaRecorder with optimal settings
 */
export function createRecorder(stream: MediaStream): MediaRecorder {
	return new MediaRecorder(stream, getRecorderOptions());
}

/**
 * Collect all chunks from a MediaRecorder and return as a single Blob
 */
export function collectChunks(recorder: MediaRecorder): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const chunks: Blob[] = [];

		recorder.ondataavailable = (e) => {
			if (e.data.size > 0) {
				chunks.push(e.data);
			}
		};

		recorder.onstop = () => {
			const mimeType = recorder.mimeType || 'audio/webm';
			resolve(new Blob(chunks, { type: mimeType }));
		};

		recorder.onerror = (e) => {
			reject(new MediaCaptureError('UNKNOWN', `Recording error: ${e}`));
		};
	});
}

/**
 * Stop all tracks in a stream
 */
export function stopStream(stream: MediaStream | null): void {
	if (stream) {
		stream.getTracks().forEach((track) => track.stop());
	}
}
