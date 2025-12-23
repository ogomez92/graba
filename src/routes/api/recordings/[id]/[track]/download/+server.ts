import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile, stat } from 'node:fs/promises';
import { getRecording, getTrackPath, getContentType, getFileExtension } from '$lib/server/recordings';

export const GET: RequestHandler = async ({ params }) => {
	const { id, track } = params;

	// Validate track name
	if (!['mic', 'system', 'mixed'].includes(track)) {
		throw error(400, { message: 'Invalid track name' });
	}

	const recording = await getRecording(id);
	if (!recording) {
		throw error(404, { message: 'Recording not found' });
	}

	// Check if track exists in this recording
	const trackFile = recording.tracks[track as keyof typeof recording.tracks];
	if (!trackFile) {
		throw error(404, { message: 'Track not found' });
	}

	const filePath = getTrackPath(id, track, recording.format);
	const contentType = getContentType(recording.format);
	const ext = getFileExtension(recording.format);

	try {
		const fileStat = await stat(filePath);
		const fileBuffer = await readFile(filePath);

		return new Response(fileBuffer, {
			headers: {
				'Content-Type': contentType,
				'Content-Length': fileStat.size.toString(),
				'Content-Disposition': `attachment; filename="${track}-${id}.${ext}"`,
				'Cache-Control': 'private, no-cache'
			}
		});
	} catch (err) {
		console.error('Error reading track file:', err);
		throw error(500, { message: 'Failed to read audio file' });
	}
};
