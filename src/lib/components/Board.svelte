<script lang="ts" module>
	export type BoardEntry = {
		key: string;
		href: string;
		spent: number;
		/** Pledged but not yet spent. */
		pending?: number;
		/** Spent in the last 24 hours. */
		recent?: number;
		meta: string;
		/** The short public reference, where the entry is a project. */
		reference?: string;
		/** Whoever submitted it, where the entry is a project. */
		by?: { handle: string; avatar: string | null };
		/** Shown in place of a rank on a board that is not ranked. */
		note?: string;
		live?: boolean;
		fresh?: boolean;
		mine?: boolean;
		series?: { at: number; micro: number }[];
	};

	export type Tier = 'lead' | 'podium' | 'rest';
</script>

<script lang="ts" generics="T extends BoardEntry">
	import type { Snippet } from 'svelte';
	import { milestone, money, standing, wholeMoney } from '#lib/format.ts';
	import Handle from './Handle.svelte';
	import Meter from './Meter.svelte';
	import Spark from './Spark.svelte';

	let {
		entries,
		ranked = true,
		label,
		unit = 'raised',
		milestones = true,
		content,
		closing
	}: {
		entries: T[];
		ranked?: boolean;
		label: string;
		/** What the amount on each cell is called. */
		unit?: string;
		/** Off where amounts are not being raised towards anything. The meter then shows a share of first place. */
		milestones?: boolean;
		content: Snippet<[T, Tier]>;
		/** The last cell, which takes up whatever remains of the last row. */
		closing: { href: string; title: string; note: string; numbered?: boolean; noscroll?: boolean };
	} = $props();

	const amounts = $derived(entries.map((e) => e.spent));
	const tierOf = (i: number): Tier => (!ranked ? 'rest' : i === 0 ? 'lead' : i < 3 ? 'podium' : 'rest');

	/** An amount that changes is marked briefly, as it would be on any live figure. */
	function tick(node: HTMLElement) {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return { duration: 0 };
		return {
			duration: 1100,
			css: (t: number) => `background: color-mix(in srgb, var(--flash) ${Math.round((1 - t) * 34)}%, transparent)`
		};
	}

	const spans = $derived.by(() => {
		const n = entries.length;
		const left = ranked ? Math.max(0, n - 3) % 3 : n % 3;
		const wide = ranked && n < 3 ? 3 : left === 0 ? 6 : left === 1 ? 4 : 2;
		const mid = (ranked ? n - 1 : n) % 2 === 0 ? 2 : 1;
		return { wide, mid, tall: ranked && n === 1, full: n === 0 };
	});
</script>

<svelte:element this={ranked ? 'ol' : 'ul'} class="board" aria-label={label} data-flip>
	{#each entries as entry, i (entry.key)}
		{@const tier = tierOf(i)}
		{@const position = ranked ? standing(amounts, i) : ''}
		<li class="slot {tier}" data-key={entry.key}>
			<article class="cell" class:mine={entry.mine}>
				<div class="top">
					{#if ranked}
						<span class="rank">{i + 1}</span>
					{:else}
						<span class="note">{entry.note}</span>
					{/if}
					<span class="tags">
						{#if entry.live}<span class="tag"><span class="dot" aria-hidden="true"></span>In progress</span>{/if}
						{#if entry.fresh}<span class="tag new">New</span>{/if}
						{#if entry.reference}<span class="ref">{entry.reference}</span>{/if}
					</span>
				</div>

				<h2 class="heading"><a class="title" href={entry.href}>{@render content(entry, tier)}</a></h2>

				{#if entry.by}<div class="by"><Handle handle={entry.by.handle} avatar={entry.by.avatar} size={tier === 'lead' ? 26 : 20} strong={tier === 'lead'} /></div>{/if}

				{#if tier === 'lead' && entry.series && entry.series.length > 1}
					<div class="chart"><Spark points={entry.series} height={100} fill /></div>
				{/if}

				<div class="foot">
					<p class="figures-row">
						{#key entry.spent}
							<span class="amount figures" in:tick>{money(entry.spent)}{' '}<span class="unit">{unit}</span></span>
						{/key}
						{#if entry.recent}<span class="recent figures">+{money(entry.recent)} in 24h</span>{/if}
						{#if milestones}<span class="target figures">of {wholeMoney(milestone(entry.spent))}</span>{/if}
					</p>
					<Meter spent={entry.spent} pending={entry.pending ?? 0} delay={Math.min(i, 8) * 45} against={milestones ? undefined : (amounts[0] ?? 0)} />
					<div class="lines">
						{#if position}<p class="position">{position}</p>{/if}
						<p class="meta">{entry.meta}</p>
					</div>
				</div>
			</article>
		</li>
	{/each}
	<li
		class="slot closing"
		class:tall={spans.tall}
		class:slim={spans.wide === 6 && !spans.full}
		class:spotlight={spans.full}
		style:--span-wide={spans.wide}
		style:--span-mid={spans.mid}
	>
		<article class="cell">
			{#if closing.numbered}<span class="rank" aria-hidden="true">{entries.length + 1}</span>{/if}
			<div class="closing-text">
				<a class="title closing-title serif" href={closing.href} data-sveltekit-reset={closing.noscroll ? 'false' : undefined}>{closing.title}</a>
				<p class="meta">{closing.note}</p>
			</div>
		</article>
	</li>
</svelte:element>

<style>
	/* One object with shared rules. The rules travel with the cells when they change places. */
	.board {
		position: relative;
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 1px;
		margin-top: 10px;
		border-radius: 14px;
		overflow: hidden;
	}
	.board::after {
		content: '';
		position: absolute;
		inset: 0;
		border: 1px solid color-mix(in srgb, var(--ink) 11%, transparent);
		border-radius: inherit;
		pointer-events: none;
	}
	.slot {
		display: grid;
		min-width: 0;
		grid-column: span 2;
	}
	.lead {
		grid-column: span 3;
		grid-row: span 2;
	}
	.podium {
		grid-column: span 3;
	}
	.closing {
		grid-column: span var(--span-wide);
	}
	.closing.tall {
		grid-row: span 2;
	}

	.cell {
		--flash: var(--signal);
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
		min-height: 196px;
		padding: 15px 18px 16px;
		background: var(--bg);
		box-shadow: 0 0 0 1px var(--rule);
		transition: background-color 0.15s ease;
	}
	.cell:active {
		background: var(--surface);
	}
	.mine {
		box-shadow:
			0 0 0 1px var(--rule),
			inset 0 0 0 1.5px var(--signal);
	}

	.top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		min-height: 2.25rem;
	}
	/* Places are set in the italic at display size, with their old-style forms. */
	.rank {
		font: italic 400 2.375rem/0.95 var(--serif);
		font-variant-numeric: oldstyle-nums;
		color: var(--ink-2);
	}
	.note {
		font-size: 0.8125rem;
		line-height: 1.3;
		color: var(--ink-2);
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		align-items: center;
		gap: 4px 10px;
		padding-top: 3px;
	}
	.tag.new {
		color: var(--ink);
	}

	.heading {
		font: inherit;
		letter-spacing: inherit;
		text-wrap: inherit;
	}
	/* The title is the link, and it covers the cell. The handle sits above it, as its own link. */
	.title {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 5;
		line-clamp: 5;
		overflow: hidden;
		font-family: var(--serif);
		font-size: 1.0625rem;
		line-height: 1.34;
		text-wrap: pretty;
		overflow-wrap: anywhere;
	}
	.title::after {
		content: '';
		position: absolute;
		inset: 0;
	}
	.title:focus-visible {
		outline: none;
	}
	.title:focus-visible::after {
		outline: 2px solid var(--accent);
		outline-offset: -3px;
		border-radius: 12px;
	}
	.by {
		display: flex;
		min-width: 0;
	}

	/* The meter has its own stacking, so a press on it has to be passed down to the link beneath. */
	.top,
	.foot {
		pointer-events: none;
	}
	.foot {
		display: grid;
		gap: 7px;
		margin-top: auto;
		padding-top: 4px;
	}
	.figures-row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px 8px;
	}
	.amount {
		font-size: 1.1875rem;
		font-weight: 500;
		line-height: 1.1;
		white-space: nowrap;
		border-radius: 3px;
	}
	.unit {
		font: 400 0.8125rem/1 var(--sans);
		letter-spacing: 0;
		color: var(--ink-2);
	}
	.target,
	.recent {
		font-size: 0.75rem;
		letter-spacing: 0;
		white-space: nowrap;
	}
	.target {
		margin-left: auto;
		color: var(--ink-2);
	}
	.recent {
		font-weight: 500;
		color: var(--signal);
	}
	.lines {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 1px 12px;
		font-size: 0.8125rem;
		line-height: 1.4;
	}
	.meta {
		color: var(--ink-2);
	}

	/* First place is the one dark surface on the board, ruled like graph paper. */
	.lead .cell {
		--flash: var(--lead-signal);
		--signal: var(--lead-signal);
		--spark: var(--lead-signal);
		--ink: var(--lead-ink);
		--ink-2: var(--lead-ink-2);
		--ink-3: var(--lead-ink-2);
		--surface: rgb(255 255 255 / 0.12);
		--rule: rgb(255 255 255 / 0.14);
		--rule-2: rgb(255 255 255 / 0.22);
		overflow: hidden;
		gap: 14px;
		padding: 20px 20px 18px;
		background-color: var(--lead);
		background-image:
			linear-gradient(var(--lead-grid) 1px, transparent 1px),
			linear-gradient(90deg, var(--lead-grid) 1px, transparent 1px);
		background-size: 24px 24px;
		color: var(--lead-ink);
	}
	.lead .cell:active {
		background-color: var(--lead-hover);
	}
	/* The history of the amount runs from edge to edge, in whatever height the cell has left over. */
	.chart {
		flex: 1 1 64px;
		min-height: 64px;
		margin-inline: -20px;
		pointer-events: none;
	}
	.lead .rank {
		font-size: 5.25rem;
		line-height: 0.8;
		color: inherit;
	}
	.lead .title {
		margin-top: 4px;
		font-size: clamp(1.375rem, 1.1rem + 0.7vw, 1.625rem);
		line-height: 1.24;
		letter-spacing: -0.006em;
		-webkit-line-clamp: 6;
		line-clamp: 6;
	}
	.lead .title:focus-visible::after {
		outline-color: var(--lead-ink);
	}
	.lead .amount {
		font-size: 2rem;
		letter-spacing: -0.03em;
	}

	.podium .rank {
		color: var(--ink);
	}
	.podium .amount {
		font-size: 1.3125rem;
	}
	.podium .title {
		font-size: 1.1875rem;
		line-height: 1.3;
		-webkit-line-clamp: 4;
		line-clamp: 4;
	}
	.podium .cell {
		min-height: 0;
	}

	/* The next place on the board, which is open. */
	.closing .cell {
		justify-content: space-between;
		min-height: 0;
		background: var(--bg);
	}
	.closing .rank {
		color: var(--ink-3);
	}
	.closing-text {
		display: grid;
		gap: 3px;
		margin-top: auto;
	}
	.closing-title {
		font-size: 1.0625rem;
		line-height: 1.3;
	}
	.closing.slim .cell {
		flex-direction: row;
		align-items: baseline;
		justify-content: flex-start;
		gap: 16px;
	}
	.closing.slim .closing-text {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px 12px;
	}
	/* An empty board: first place itself is vacant. */
	.closing.spotlight {
		grid-column: 1 / -1;
	}
	.closing.spotlight .cell {
		--ink-3: var(--lead-ink-2);
		--ink-2: var(--lead-ink-2);
		min-height: 300px;
		padding: 22px;
		background-color: var(--lead);
		background-image:
			linear-gradient(var(--lead-grid) 1px, transparent 1px),
			linear-gradient(90deg, var(--lead-grid) 1px, transparent 1px);
		background-size: 24px 24px;
		color: var(--lead-ink);
	}
	.closing.spotlight .rank {
		font-size: 7rem;
		line-height: 0.8;
		color: inherit;
	}
	.closing.spotlight .closing-title {
		font-size: clamp(1.625rem, 1.2rem + 1.2vw, 2.25rem);
		line-height: 1.15;
	}

	@media (hover: hover) and (pointer: fine) {
		.cell:has(.title:hover),
		.closing .cell:has(.title:hover) {
			background-color: var(--surface);
			box-shadow:
				0 0 0 1px var(--rule),
				inset 0 0 0 1px var(--signal);
		}
		.lead .cell:has(.title:hover),
		.closing.spotlight .cell:has(.title:hover) {
			background-color: var(--lead-hover);
		}
	}

	@media (max-width: 860px) {
		.board {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.slot,
		.podium {
			grid-column: span 1;
		}
		.lead {
			grid-column: span 2;
			grid-row: auto;
		}
		.closing,
		.closing.tall {
			grid-column: span var(--span-mid);
			grid-row: auto;
		}
		.closing.spotlight {
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 560px) {
		.board {
			grid-template-columns: minmax(0, 1fr);
		}
		.slot,
		.podium,
		.lead,
		.closing,
		.closing.tall {
			grid-column: auto;
		}
		.cell {
			min-height: 0;
			padding: 14px 16px 15px;
		}
		.lead .cell {
			padding: 18px 16px;
		}
		.lead .rank {
			font-size: 4.25rem;
		}
		.lead .amount {
			font-size: 1.75rem;
		}
		.lead .title {
			margin-top: 6px;
			font-size: 1.3125rem;
		}
		.chart {
			margin-inline: -16px;
		}
		.podium .title {
			font-size: 1.0625rem;
			line-height: 1.36;
		}
		.title,
		.podium .title {
			-webkit-line-clamp: 8;
			line-clamp: 8;
		}
		.closing.spotlight .cell {
			min-height: 220px;
		}
	}
</style>
