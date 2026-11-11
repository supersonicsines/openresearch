<script lang="ts">
	import { money, reference, shortAgo } from '#lib/format.ts';

	type Item = {
		key: string;
		kind: 'submitted' | 'pledged' | 'completed' | 'proposed' | 'backed' | 'won';
		at: number;
		handle: string;
		id: number;
		slug: string;
		micro: number;
		seq: number;
	};
	let { items }: { items: Item[] } = $props();

	let paused = $state(false);

	// Roughly constant reading speed, however many items there are.
	const duration = $derived(Math.max(items.length * 6, 24));
</script>

<!-- The feed is not a place to tab through: it would stand between the keyboard and the page. -->
{#snippet line(item: Item)}
	<a href="/p/{item.slug}" tabindex="-1">
		<span class="what">
			{#if item.kind === 'submitted'}
				<span class="ref">{reference(item.id)}</span> submitted by <b>@{item.handle}</b>
			{:else if item.kind === 'pledged'}
				<em class="paid">{money(item.micro)}</em> pledged to <span class="ref">{reference(item.id)}</span> by <b>@{item.handle}</b>
			{:else if item.kind === 'proposed'}
				A question was proposed on <span class="ref">{reference(item.id)}</span> by <b>@{item.handle}</b>
			{:else if item.kind === 'backed'}
				<em class="paid">{money(item.micro)}</em> pledged to a question on <span class="ref">{reference(item.id)}</span> by <b>@{item.handle}</b>
			{:else if item.kind === 'won'}
				Round {item.seq} of <span class="ref">{reference(item.id)}</span> closed with <em class="paid">{money(item.micro)}</em> pledged to the leading question
			{:else}
				Run {item.seq} of <span class="ref">{reference(item.id)}</span> completed for <em class="paid">{money(item.micro)}</em>, funded by <b>@{item.handle}</b>
			{/if}
		</span>
		<time>{shortAgo(item.at)}</time>
	</a>
{/snippet}

{#if items.length}
	<section class="ticker" class:paused aria-label="Recent activity">
		<span class="live"><span class="dot" aria-hidden="true"></span>Live</span>
		<div class="viewport">
			<div class="belt" style:animation-duration="{duration}s">
				<ul class="run">
					{#each items as item (item.key)}<li>{@render line(item)}</li>{/each}
				</ul>
				<!-- The second copy makes the loop seamless, and is hidden from assistive technology. -->
				<ul class="run" aria-hidden="true">
					{#each items as item (item.key)}<li>{@render line(item)}</li>{/each}
				</ul>
			</div>
		</div>
		<button class="pause" type="button" aria-pressed={paused} aria-label={paused ? 'Resume the activity feed' : 'Pause the activity feed'} onclick={() => (paused = !paused)}>
			{#if paused}
				<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M3 1.5v9l7-4.5z" /></svg>
			{:else}
				<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" /></svg>
			{/if}
		</button>
	</section>
{/if}

<style>
	.ticker {
		display: flex;
		align-items: center;
		border-block: 1px solid var(--rule);
		background: var(--surface);
		font: 400 0.75rem/1 var(--mono);
		color: var(--ink-2);
	}
	.live {
		position: relative;
		z-index: 1;
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 9px 14px 9px var(--gutter);
		font-weight: 500;
		color: var(--ink);
		background: var(--surface);
		border-right: 1px solid var(--rule);
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--signal);
		animation: breathe 2.4s ease-in-out infinite;
	}
	@keyframes breathe {
		50% {
			opacity: 0.35;
		}
	}
	.viewport {
		flex: 1;
		min-width: 0;
		overflow: hidden;
	}
	.belt {
		display: flex;
		width: max-content;
		animation: slide linear infinite;
	}
	.ticker:hover .belt,
	.ticker:focus-within .belt,
	.paused .belt {
		animation-play-state: paused;
	}
	@keyframes slide {
		to {
			transform: translateX(-50%);
		}
	}
	.run {
		display: flex;
		flex: none;
	}
	li a {
		display: inline-flex;
		align-items: baseline;
		gap: 8px;
		padding: 9px 20px;
		white-space: nowrap;
	}
	li + li a {
		border-left: 1px solid var(--rule);
	}
	.run + .run li:first-child a {
		border-left: 1px solid var(--rule);
	}
	li a:focus-visible {
		outline-offset: -3px;
	}
	b {
		font-weight: 500;
		color: var(--ink);
	}
	.ref {
		color: var(--ink);
	}
	.paid {
		font-style: normal;
		font-weight: 500;
		color: var(--signal);
	}
	time {
		color: var(--ink-2);
	}
	@media (hover: hover) and (pointer: fine) {
		li a:hover .what {
			color: var(--ink);
		}
		.pause:hover {
			color: var(--ink);
		}
	}
	.pause {
		position: relative;
		z-index: 1;
		flex: none;
		display: grid;
		place-items: center;
		width: 34px;
		align-self: stretch;
		color: var(--ink-2);
		background: var(--surface);
		border-left: 1px solid var(--rule);
	}
	/* Those who prefer no motion can scroll the feed by hand instead. */
	@media (prefers-reduced-motion: reduce) {
		.viewport {
			overflow-x: auto;
			scrollbar-width: none;
		}
		.belt {
			animation: none;
		}
		.run[aria-hidden='true'],
		.pause {
			display: none;
		}
	}
</style>
