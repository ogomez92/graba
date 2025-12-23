<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import LanguageSelector from '$lib/components/LanguageSelector.svelte';
	import { initializeLanguage } from '$lib/i18n/index.svelte';

	let { children } = $props();

	// Initialize language on mount (browser-side only)
	$effect(() => {
		initializeLanguage();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<LanguageSelector />

{@render children()}
