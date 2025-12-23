import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteRecording, getRecording } from '$lib/server/recordings';

export const DELETE: RequestHandler = async ({ params }) => {
	const { id } = params;

	const recording = await getRecording(id);
	if (!recording) {
		throw error(404, { message: 'Recording not found' });
	}

	const deleted = await deleteRecording(id);

	if (!deleted) {
		throw error(500, { message: 'Failed to delete recording' });
	}

	return json({ success: true });
};
