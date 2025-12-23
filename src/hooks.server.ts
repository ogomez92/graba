import { cleanupExpiredRecordings, ensureDataDirs } from '$lib/server/recordings';

// Initialize data directories and run cleanup on server start
async function init() {
	try {
		await ensureDataDirs();
		const cleaned = await cleanupExpiredRecordings();
		if (cleaned > 0) {
			console.log(`Cleaned up ${cleaned} expired recording(s)`);
		}
	} catch (err) {
		console.error('Failed to initialize recordings:', err);
	}
}

// Run initialization
init();

// Periodic cleanup every hour
setInterval(
	async () => {
		try {
			const cleaned = await cleanupExpiredRecordings();
			if (cleaned > 0) {
				console.log(`Periodic cleanup: removed ${cleaned} expired recording(s)`);
			}
		} catch (err) {
			console.error('Periodic cleanup failed:', err);
		}
	},
	60 * 60 * 1000
); // 1 hour
