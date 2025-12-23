import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadRecordings, cleanupExpiredRecordings } from '$lib/server/recordings';

export const GET: RequestHandler = async () => {
	// Run cleanup on each request (lightweight check)
	await cleanupExpiredRecordings();

	const index = await loadRecordings();

	// Sort by creation date, newest first
	const sorted = [...index.recordings].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
	);

	return json({ recordings: sorted });
};
