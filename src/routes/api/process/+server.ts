import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writeFile, mkdir } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import {
	generateRecordingId,
	getRecordingDir,
	getTrackPath,
	createRecording,
	type OutputFormat
} from '$lib/server/recordings';

const execAsync = promisify(exec);

// Format codecs for ffmpeg (high quality stereo output)
const FORMAT_CODECS: Record<OutputFormat, string> = {
	mp3: 'libmp3lame -b:a 320k',
	aac: 'aac -b:a 256k',
	opus: 'libopus -b:a 256k'
};

// Config for large audio file uploads (5GB limit)
export const config = {
	body: {
		maxSize: 5 * 1024 * 1024 * 1024 // 5GB
	}
};

export const POST: RequestHandler = async ({ request }) => {
	const recordingId = generateRecordingId();
	const recordingDir = getRecordingDir(recordingId);

	try {
		await mkdir(recordingDir, { recursive: true });

		const formData = await request.formData();
		const systemAudio = formData.get('systemAudio') as File | null;
		const micAudio = formData.get('micAudio') as File | null;
		const duckSystemAudio = formData.get('duckSystemAudio') === 'true';
		const outputFormat = (formData.get('outputFormat') as OutputFormat) || 'mp3';
		const duration = parseInt(formData.get('duration') as string) || 0;

		if (!systemAudio) {
			throw error(400, { message: 'No system audio provided' });
		}

		const codec = FORMAT_CODECS[outputFormat];
		const tracks: { mic?: string; system?: string; mixed?: string } = {};

		// Save uploaded files as temp webm
		const systemInputPath = path.join(recordingDir, 'system_input.webm');
		const micInputPath = path.join(recordingDir, 'mic_input.webm');

		const systemBuffer = Buffer.from(await systemAudio.arrayBuffer());
		await writeFile(systemInputPath, systemBuffer);

		if (micAudio) {
			const micBuffer = Buffer.from(await micAudio.arrayBuffer());
			await writeFile(micInputPath, micBuffer);
		}

		// Process system audio
		const systemOutputPath = getTrackPath(recordingId, 'system', outputFormat);
		await execAsync(
			`ffmpeg -i "${systemInputPath}" -ac 2 -ar 48000 -c:a ${codec} "${systemOutputPath}" -y`
		);
		tracks.system = `system.${outputFormat === 'aac' ? 'm4a' : outputFormat}`;

		// Process mic audio if present
		if (micAudio) {
			const micOutputPath = getTrackPath(recordingId, 'mic', outputFormat);
			await execAsync(
				`ffmpeg -i "${micInputPath}" -ac 2 -ar 48000 -c:a ${codec} "${micOutputPath}" -y`
			);
			tracks.mic = `mic.${outputFormat === 'aac' ? 'm4a' : outputFormat}`;

			// Create mixed track
			const mixedOutputPath = getTrackPath(recordingId, 'mixed', outputFormat);

			if (duckSystemAudio) {
				// Apply sidechaincompress for ducking
				// Mic triggers compression on system audio
				const filterComplex = [
					'[1:a]asplit=2[sc][mic]',
					'[0:a][sc]sidechaincompress=threshold=0.02:ratio=4:attack=50:release=500[ducked]',
					'[ducked][mic]amix=inputs=2:duration=longest:weights=0.7 1[out]'
				].join(';');

				await execAsync(
					`ffmpeg -i "${systemInputPath}" -i "${micInputPath}" ` +
						`-filter_complex "${filterComplex}" ` +
						`-map "[out]" -ac 2 -ar 48000 -c:a ${codec} "${mixedOutputPath}" -y`
				);
			} else {
				// Simple mix without ducking
				await execAsync(
					`ffmpeg -i "${systemInputPath}" -i "${micInputPath}" ` +
						`-filter_complex "[0:a][1:a]amix=inputs=2:duration=longest:weights=0.7 1[out]" ` +
						`-map "[out]" -ac 2 -ar 48000 -c:a ${codec} "${mixedOutputPath}" -y`
				);
			}
			tracks.mixed = `mixed.${outputFormat === 'aac' ? 'm4a' : outputFormat}`;
		}

		// Clean up input files
		await execAsync(`rm -f "${systemInputPath}" "${micInputPath}"`);

		// Save recording metadata
		await createRecording({
			id: recordingId,
			duration,
			hasMic: !!micAudio,
			hasSystemAudio: true,
			format: outputFormat,
			tracks
		});

		// Return download URLs
		const baseUrl = `/api/recordings/${recordingId}`;
		return json({
			id: recordingId,
			systemAudioUrl: tracks.system ? `${baseUrl}/system/download` : null,
			micAudioUrl: tracks.mic ? `${baseUrl}/mic/download` : null,
			mixedAudioUrl: tracks.mixed ? `${baseUrl}/mixed/download` : null
		});
	} catch (err) {
		console.error('Processing error:', err);

		// Clean up on error
		try {
			await execAsync(`rm -rf "${recordingDir}"`);
		} catch {
			// Ignore cleanup errors
		}

		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		throw error(500, { message: 'Audio processing failed. Please try again.' });
	}
};
