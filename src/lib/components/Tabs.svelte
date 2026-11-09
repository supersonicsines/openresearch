<script lang="ts">
	import { tick } from 'svelte';

	type Item = { href: string; label: string; active: boolean; count?: number };
	let { items, label, noscroll = false }: { items: Item[]; label: string; noscroll?: boolean } = $props();

	let list = $state<HTMLElement>();
	let x = $state(0);
	let width = $state(0);
	let ready = $state(false);

	async function measure() {
		await tick();
		const current = list?.querySelector<HTMLElement>('a[aria-current="page"]');
		if (!current) {
			width = 0;
			return;
		}
		x = current.offsetLeft;
		width = current.offsetWidth;
	}

	$effect(() => {
		items;
		measure();
	});

	$effect(() => {
		// Fonts settle the widths of the labels, so the first placement waits for them.
		document.fonts?.ready.then(() => {
			measure().then(() => requestAnimationFrame(() => (ready = true)));
		});
	});
</script>

<svelte:window onresize={measure} />

<nav aria-label={label} bind:this={list} class="tabs">
	{#each items as item (item.href)}
		<a
			href={item.href}
			aria-current={item.active ? 'page' : undefined}
			data-sveltekit-reset={noscroll ? 'false' : undefined}
		>
			{item.label}{#if item.count !== undefined}<span class="count figures">{item.count}</span>{/if}
		</a>
	{/each}
	<span class="bar" class:ready style:width="{width}px" style:transform="translateX({x}px)" aria-hidden="true"></span>
</nav>

<style>
	.tabs {
		position: relative;
		display: flex;
		gap: 24px;
		/* The rule is drawn inside the box, because a scrolling box clips whatever lies outside it. */
		box-shadow: inset 0 -1px 0 var(--rule);
		overflow-x: auto;
		scrollbar-width: none;
	}
	.tabs::-webkit-scrollbar {
		display: none;
	}
	a {
		flex: none;
		padding: 10px 0 11px;
		font-size: 0.9375rem;
		color: var(--ink-2);
		transition: color 0.15s ease;
	}
	a[aria-current='page'] {
		color: var(--ink);
	}
	@media (hover: hover) and (pointer: fine) {
		a:hover {
			color: var(--ink);
		}
	}
	.count {
		margin-left: 6px;
		font-size: 0.875rem;
		color: var(--ink-3);
	}
	.bar {
		position: absolute;
		left: 0;
		bottom: 0;
		height: 1.5px;
		background: var(--ink);
		pointer-events: none;
	}
	.bar.ready {
		transition:
			transform 0.28s var(--ease-out),
			width 0.28s var(--ease-out);
	}
</style>
