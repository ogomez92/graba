<script lang="ts">
	import { getLanguageState, type Language } from '$lib/i18n/index.svelte';

	const i18n = getLanguageState();

	function handleChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		i18n.language = target.value as Language;
	}
</script>

<div class="language-selector">
	<label for="language-select">{i18n.t.languageLabel}:</label>
	<select id="language-select" value={i18n.language} onchange={handleChange}>
		{#each i18n.languages as lang}
			<option value={lang.code}>{lang.name}</option>
		{/each}
	</select>
</div>

<style>
	.language-selector {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		justify-content: flex-end;
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
	}

	label {
		color: #666;
	}

	select {
		padding: 0.25rem 0.5rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: white;
		font-size: 0.875rem;
		cursor: pointer;
	}

	select:hover {
		border-color: #999;
	}
</style>
