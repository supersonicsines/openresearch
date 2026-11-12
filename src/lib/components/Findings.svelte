<script lang="ts">
	import { onMount } from 'svelte';

	let { html }: { html: string } = $props();

	let box = $state<HTMLElement>();
	let count = $state(0);
	let opened = $state(0);
	/** The headings of the sections a reader has opened, so that they stay open when a run revises the findings. */
	const kept = new Set<string>();

	const all = () => [...(box?.querySelectorAll<HTMLDetailsElement>('details.section') ?? [])];
	const title = (section: HTMLDetailsElement) => section.querySelector('summary h2')?.textContent ?? '';

	function measure() {
		const list = all();
		count = list.length;
		opened = list.filter((section) => section.open).length;
	}

	$effect(() => {
		html;
		for (const section of all()) if (kept.has(title(section))) section.open = true;
		measure();
	});

	function toggled(event: Event) {
		const section = event.target;
		if (!(section instanceof HTMLDetailsElement) || !section.matches('details.section')) return;
		if (section.open) kept.add(title(section));
		else kept.delete(title(section));
		measure();
	}

	function setAll(open: boolean) {
		for (const section of all()) {
			section.open = open;
			if (open) kept.add(title(section));
			else kept.delete(title(section));
		}
		measure();
	}

	/** A section named in the address is opened, so that a link to it shows what it points at. */
	function openNamed() {
		const named = location.hash.startsWith('#section-') ? document.getElementById(location.hash.slice(1)) : null;
		if (named instanceof HTMLDetailsElement && box?.contains(named)) {
			named.open = true;
			kept.add(title(named));
			measure();
			named.scrollIntoView({ block: 'start' });
		}
	}

	onMount(() => {
		openNamed();
		addEventListener('hashchange', openNamed);
		return () => removeEventListener('hashchange', openNamed);
	});
</script>

<!-- The toggle event does not bubble, so it is heard on its way down. -->
<div class="prose findings" bind:this={box} ontogglecapture={toggled}>{@html html}</div>

{#if count > 1}
	<p class="tools small muted">
		<span><span class="figures">{count}</span>{' '}sections, <span class="figures">{opened}</span>{' '}open.</span>
		<button class="text" type="button" onclick={() => setAll(opened < count)}>{opened < count ? 'Open all' : 'Close all'}</button>
	</p>
{/if}

<style>
	.tools {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px 10px;
		margin-top: 14px;
	}
	.text {
		padding-block: 4px;
		margin-block: -4px;
		color: var(--ink-2);
		text-decoration: underline;
		text-decoration-color: var(--rule-2);
		text-underline-offset: 0.2em;
	}
</style>
