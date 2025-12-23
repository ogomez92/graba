import type { PageServerLoad } from './$types';
import { loadRecordings, cleanupExpiredRecordings } from '$lib/server/recordings';

export const load: PageServerLoad = async () => {
	// Run cleanup and load recordings
	await cleanupExpiredRecordings();
	const index = await loadRecordings();

	// Sort by creation date, newest first
	const recordings = [...index.recordings].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
	);

	return {
		recordings
	};
};
