<script lang="ts">
	import type { Recording } from '$lib/server/recordings';

	interface Props {
		recordings: Recording[];
		onDelete?: (id: string) => void;
	}

	let { recordings, onDelete }: Props = $props();

	let previewAudio: HTMLAudioElement | null = $state(null);
	let currentPreview: { id: string; track: string } | null = $state(null);
	let isPlaying = $state(false);
	let deletingId: string | null = $state(null);
	let statusMessage = $state('');

	function formatDate(isoString: string): string {
		const date = new Date(isoString);
		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatDuration(seconds: number): string {
		const hrs = Math.floor(seconds / 3600);
		const mins = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;

		if (hrs > 0) {
			return `${hrs}h ${mins}m ${secs}s`;
		} else if (mins > 0) {
			return `${mins}m ${secs}s`;
		}
		return `${secs}s`;
	}

	function formatRelativeTime(isoString: string): string {
		const date = new Date(isoString);
		const now = new Date();
		const diffMs = date.getTime() - now.getTime();
		const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays < 0) {
			return 'Expired';
		} else if (diffDays === 0) {
			return 'Expires today';
		} else if (diffDays === 1) {
			return 'Expires tomorrow';
		}
		return `Expires in ${diffDays} days`;
	}

	function getTrackLabel(track: string): string {
		switch (track) {
			case 'mic':
				return 'Microphone';
			case 'system':
				return 'System Audio';
			case 'mixed':
				return 'Mixed';
			default:
				return track;
		}
	}

	function getFileExtension(format: string): string {
		switch (format) {
			case 'mp3':
				return 'mp3';
			case 'aac':
				return 'm4a';
			case 'opus':
				return 'webm';
			default:
				return format;
		}
	}

	async function togglePreview(recordingId: string, track: string) {
		// If same track, toggle play/pause
		if (currentPreview?.id === recordingId && currentPreview?.track === track) {
			if (isPlaying) {
				previewAudio?.pause();
				isPlaying = false;
				statusMessage = 'Preview paused';
			} else {
				await previewAudio?.play();
				isPlaying = true;
				statusMessage = 'Playing preview';
			}
			return;
		}

		// Stop current preview
		if (previewAudio) {
			previewAudio.pause();
			previewAudio = null;
		}

		// Start new preview
		const audio = new Audio(`/api/recordings/${recordingId}/${track}/preview`);
		audio.onended = () => {
			isPlaying = false;
			currentPreview = null;
			statusMessage = 'Preview ended';
		};
		audio.onerror = () => {
			isPlaying = false;
			currentPreview = null;
			statusMessage = 'Preview failed to load';
		};

		previewAudio = audio;
		currentPreview = { id: recordingId, track };

		try {
			await audio.play();
			isPlaying = true;
			statusMessage = `Playing ${getTrackLabel(track)} preview`;
		} catch {
			statusMessage = 'Failed to play preview';
		}
	}

	async function handleDelete(id: string) {
		deletingId = id;

		try {
			const response = await fetch(`/api/recordings/${id}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				statusMessage = 'Recording deleted';
				onDelete?.(id);
			} else {
				statusMessage = 'Failed to delete recording';
			}
		} catch {
			statusMessage = 'Failed to delete recording';
		} finally {
			deletingId = null;
		}
	}

	function getAvailableTracks(recording: Recording): string[] {
		const tracks: string[] = [];
		if (recording.tracks.system) tracks.push('system');
		if (recording.tracks.mic) tracks.push('mic');
		if (recording.tracks.mixed) tracks.push('mixed');
		return tracks;
	}

	// Cleanup on component destroy
	$effect(() => {
		return () => {
			if (previewAudio) {
				previewAudio.pause();
				previewAudio = null;
			}
		};
	});
</script>

<section class="recording-history" aria-label="Past recordings">
	<!-- Status announcer -->
	<div role="status" aria-live="polite" class="sr-only">
		{statusMessage}
	</div>

	<h2>Recent Recordings</h2>

	{#if recordings.length === 0}
		<p class="empty-message">No recordings yet. Start by recording above.</p>
	{:else}
		<ul class="recording-list">
			{#each recordings as recording (recording.id)}
				<li class="recording-item">
					<div class="recording-info">
						<time datetime={recording.createdAt}>
							{formatDate(recording.createdAt)}
						</time>
						<span class="duration">{formatDuration(recording.duration)}</span>
						<span class="expires" class:expiring-soon={new Date(recording.expiresAt).getTime() - Date.now() < 2 * 24 * 60 * 60 * 1000}>
							{formatRelativeTime(recording.expiresAt)}
						</span>
					</div>

					<div class="recording-tracks" role="group" aria-label="Available tracks">
						{#each getAvailableTracks(recording) as track}
							<div class="track">
								<button
									type="button"
									class="btn-preview"
									class:playing={currentPreview?.id === recording.id && currentPreview?.track === track && isPlaying}
									onclick={() => togglePreview(recording.id, track)}
									aria-label="{currentPreview?.id === recording.id && currentPreview?.track === track && isPlaying ? 'Pause' : 'Play'} {getTrackLabel(track)} preview"
								>
									{#if currentPreview?.id === recording.id && currentPreview?.track === track && isPlaying}
										⏸
									{:else}
										▶
									{/if}
								</button>
								<span class="track-label">{getTrackLabel(track)}</span>
								<a
									href="/api/recordings/{recording.id}/{track}/download"
									download="{track}-{recording.id}.{getFileExtension(recording.format)}"
									class="btn-download-small"
									aria-label="Download {getTrackLabel(track)}"
								>
									Download
								</a>
							</div>
						{/each}
					</div>

					<button
						type="button"
						class="btn-delete"
						onclick={() => handleDelete(recording.id)}
						disabled={deletingId === recording.id}
						aria-label="Delete recording from {formatDate(recording.createdAt)}"
					>
						{#if deletingId === recording.id}
							Deleting...
						{:else}
							Delete
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.recording-history {
		max-width: 600px;
		margin: 2rem auto 0;
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

	h2 {
		margin-top: 0;
		margin-bottom: 1rem;
		font-size: 1.25rem;
	}

	.empty-message {
		color: #666;
		font-style: italic;
	}

	.recording-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.recording-item {
		border: 1px solid #ddd;
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 1rem;
		background: #fafafa;
	}

	.recording-info {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		margin-bottom: 0.75rem;
		font-size: 0.875rem;
	}

	.recording-info time {
		font-weight: 500;
	}

	.duration {
		color: #666;
	}

	.expires {
		color: #666;
	}

	.expires.expiring-soon {
		color: #c00;
		font-weight: 500;
	}

	.recording-tracks {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.track {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.track-label {
		flex: 1;
		font-size: 0.875rem;
	}

	.btn-preview {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid #ccc;
		border-radius: 50%;
		background: white;
		cursor: pointer;
		font-size: 0.75rem;
		transition: all 0.2s;
	}

	.btn-preview:hover {
		background: #f0f0f0;
	}

	.btn-preview.playing {
		background: #007bff;
		border-color: #007bff;
		color: white;
	}

	.btn-download-small {
		padding: 0.25rem 0.75rem;
		font-size: 0.75rem;
		background: #28a745;
		color: white;
		border: none;
		border-radius: 4px;
		text-decoration: none;
		cursor: pointer;
	}

	.btn-download-small:hover {
		background: #1e7e34;
	}

	.btn-delete {
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		background: #dc3545;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	.btn-delete:hover:not(:disabled) {
		background: #c82333;
	}

	.btn-delete:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
