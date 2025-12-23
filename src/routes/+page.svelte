<script lang="ts">
	import AudioRecorder from '$lib/components/AudioRecorder.svelte';
	import RecordingHistory from '$lib/components/RecordingHistory.svelte';
	import type { Recording } from '$lib/server/recordings';
	import { getLanguageState } from '$lib/i18n';

	interface PageData {
		recordings: Recording[];
	}

	let { data }: { data: PageData } = $props();
	let localRecordings = $state<Recording[] | null>(null);

	const i18n = getLanguageState();

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
	<title>{i18n.t.appTitle}</title>
	<meta name="description" content={i18n.t.appDescription} />
</svelte:head>

<main>
	<h1>{i18n.t.appTitle}</h1>
	<p class="intro">
		{i18n.t.appIntro}
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
