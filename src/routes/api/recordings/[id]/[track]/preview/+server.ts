import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile, stat } from 'node:fs/promises';
import { getRecording, getTrackPath, getContentType } from '$lib/server/recordings';

export const GET: RequestHandler = async ({ params, request }) => {
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

	try {
		const fileStat = await stat(filePath);
		const fileSize = fileStat.size;

		// Handle range requests for seeking
		const rangeHeader = request.headers.get('range');

		if (rangeHeader) {
			const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
			if (match) {
				const start = parseInt(match[1], 10);
				const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

				if (start >= fileSize) {
					return new Response(null, {
						status: 416,
						headers: { 'Content-Range': `bytes */${fileSize}` }
					});
				}

				const fileBuffer = await readFile(filePath);
				const chunk = fileBuffer.subarray(start, end + 1);

				return new Response(chunk, {
					status: 206,
					headers: {
						'Content-Type': contentType,
						'Content-Length': chunk.length.toString(),
						'Content-Range': `bytes ${start}-${end}/${fileSize}`,
						'Accept-Ranges': 'bytes',
						'Cache-Control': 'private, max-age=3600'
					}
				});
			}
		}

		// Full file response
		const fileBuffer = await readFile(filePath);

		return new Response(fileBuffer, {
			headers: {
				'Content-Type': contentType,
				'Content-Length': fileSize.toString(),
				'Accept-Ranges': 'bytes',
				'Cache-Control': 'private, max-age=3600'
			}
		});
	} catch (err) {
		console.error('Error reading track file:', err);
		throw error(500, { message: 'Failed to read audio file' });
	}
};
