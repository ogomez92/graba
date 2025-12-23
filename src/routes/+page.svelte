<script lang="ts">
	import AudioRecorder from '$lib/components/AudioRecorder.svelte';
	import RecordingHistory from '$lib/components/RecordingHistory.svelte';
	import type { Recording } from '$lib/server/recordings';

	interface PageData {
		recordings: Recording[];
	}

	let { data }: { data: PageData } = $props();
	let localRecordings = $state<Recording[] | null>(null);

	// Use local state if set, otherwise use server data
	let recordings = $derived(localRecordings ?? data.recordings);

	async function refreshRecordings() {
		try {
			const response = await fetch('/api/recordings');
			if (response.ok) {
				const result = await response.json();
				localRecordings = result.recordings;
			}
		} catch {
			// Silent fail - recordings will refresh on next page load
		}
	}

	function handleDelete(id: string) {
		localRecordings = recordings.filter((r) => r.id !== id);
	}
</script>

<svelte:head>
	<title>Audio Recorder</title>
	<meta name="description" content="High-quality screen and microphone audio recorder" />
</svelte:head>

<main>
	<h1>Audio Recorder</h1>
	<p class="intro">
		Record high-quality audio from your screen or browser tab, with optional microphone mixing.
	</p>

	<AudioRecorder onRecordingComplete={refreshRecordings} />

	<RecordingHistory {recordings} onDelete={handleDelete} />
</main>

<style>
	main {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem 1rem;
	}

	h1 {
		margin-bottom: 0.5rem;
		font-size: 2rem;
		text-align: center;
	}

	.intro {
		text-align: center;
		color: #666;
		margin-bottom: 2rem;
	}
</style>
