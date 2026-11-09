<script lang="ts">
	import { goto } from '$app/navigation';
	import Handle from '#lib/components/Handle.svelte';
	import Meter from '#lib/components/Meter.svelte';
	import { money, plural, reference, shortAgo } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const FILTERS = [
		{ value: 'all', label: 'All' },
		{ value: 'live', label: 'In progress' },
		{ value: 'funded', label: 'Funded' },
		{ value: 'unfunded', label: 'Unfunded' }
	];
	const COLUMNS = [
		{ value: 'recent', label: 'Newest' },
		{ value: 'donated', label: 'Most funded' },
		{ value: 'rising', label: 'Rising' }
	];

	function link(change: Record<string, string | number>) {
		const next = { sort: data.sort, filter: data.filter, q: data.query, page: 1, ...change };
		const params = new URLSearchParams();
		if (next.sort !== 'recent') params.set('sort', String(next.sort));
		if (next.filter !== 'all') params.set('filter', String(next.filter));
		if (next.q) params.set('q', String(next.q));
		if (Number(next.page) > 1) params.set('page', String(next.page));
		const query = params.toString();
		return query ? `/prompts?${query}` : '/prompts';
	}

	let search = $derived(data.query);
	function submitSearch(event: SubmitEvent) {
		event.preventDefault();
		goto(link({ q: search.trim() }), { reset: false });
	}
</script>

<svelte:head>
	<title>All prompts · OpenResearch</title>
</svelte:head>

<header class="head">
	<h1 class="serif">All prompts</h1>
	<p class="muted figures-line">{plural(data.total, data.query || data.filter !== 'all' ? 'match' : 'prompt', data.query || data.filter !== 'all' ? 'matches' : 'prompts')}</p>
</header>

<div class="controls">
	<div class="groups">
		<div class="group" role="group" aria-label="Order">
			{#each COLUMNS as column (column.value)}
				<a class="chip" href={link({ sort: column.value })} aria-current={data.sort === column.value ? 'true' : undefined} data-sveltekit-reset="false">{column.label}</a>
			{/each}
		</div>
		<div class="group" role="group" aria-label="Filter">
			{#each FILTERS as filter (filter.value)}
				<a class="chip" href={link({ filter: filter.value })} aria-current={data.filter === filter.value ? 'true' : undefined} data-sveltekit-reset="false">{filter.label}</a>
			{/each}
		</div>
	</div>
	<form class="search" role="search" action="/prompts" method="GET" onsubmit={submitSearch}>
		{#if data.sort !== 'recent'}<input type="hidden" name="sort" value={data.sort} />{/if}
		{#if data.filter !== 'all'}<input type="hidden" name="filter" value={data.filter} />{/if}
		<input class="field" type="search" name="q" placeholder="Search prompts or @handles" aria-label="Search prompts or handles" autocomplete="off" enterkeyhint="search" bind:value={search} />
	</form>
</div>

{#if data.rows.length === 0}
	<div class="none">
		<p class="serif">
			{#if data.query}No prompts match this search.{:else if data.filter !== 'all'}No prompts are listed under this filter.{:else}No prompts have been submitted as yet.{/if}
		</p>
		{#if data.query || data.filter !== 'all'}<a class="link" href="/prompts">All prompts may be shown instead.</a>{:else}<a class="link" href="/submit">A prompt of up to 250 words may be submitted.</a>{/if}
	</div>
{:else}
	<div class="ledger" data-flip>
		<table>
			<thead>
				<tr>
					<th scope="col" class="c-ref">Ref.</th>
					<th scope="col">Prompt</th>
					<th scope="col" class="c-by">Submitted by</th>
					<th scope="col" class="c-num">Raised</th>
					<th scope="col" class="c-num c-runs">Runs</th>
					<th scope="col" class="c-num c-donors">Donors</th>
					<th scope="col" class="c-num c-age">Age</th>
				</tr>
			</thead>
			<tbody>
				{#each data.rows as row (row.id)}
					<tr data-key={row.id}>
						<td class="c-ref ref">{reference(row.id)}</td>
						<td class="c-prompt">
							<a class="title serif" href="/p/{row.slug}">{row.title}</a>
							{#if row.active}<span class="tag"><span class="dot" aria-hidden="true"></span>In progress</span>{/if}
							<div class="phone-by"><Handle handle={row.author_handle} avatar={row.author_avatar} size={18} /></div>
						</td>
						<td class="c-by"><Handle handle={row.author_handle} avatar={row.author_avatar} size={20} /></td>
						<td class="c-num">
							<span class="figures sum">{money(row.spent)}</span>
							{#if row.spent_24h}<span class="figures up">+{money(row.spent_24h)}</span>{/if}
							<Meter spent={row.spent} pending={row.pending} />
						</td>
						<td class="c-num c-runs figures">{row.runs}</td>
						<td class="c-num c-donors figures">{row.donors}</td>
						<td class="c-num c-age figures"><time datetime={new Date(row.created_at).toISOString()}>{shortAgo(row.created_at)}</time></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if data.pages > 1}
		<nav class="pages" aria-label="Pages">
			{#if data.current > 1}<a class="btn btn-quiet btn-small" rel="prev" href={link({ page: data.current - 1 })}>Previous</a>{/if}
			<span class="figures of">Page {data.current} of {data.pages}</span>
			{#if data.current < data.pages}<a class="btn btn-quiet btn-small" rel="next" href={link({ page: data.current + 1 })}>Next</a>{/if}
		</nav>
	{/if}
{/if}

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 14px;
		padding-block: 32px 18px;
	}
	h1 {
		font-size: clamp(1.625rem, 1.2rem + 1.5vw, 2.25rem);
		line-height: 1.16;
		letter-spacing: -0.012em;
	}
	.figures-line {
		font: 400 0.875rem/1.3 var(--mono);
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px 24px;
	}
	.groups {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 20px;
	}
	.group {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		min-height: 32px;
		padding: 0 11px;
		border: 1px solid transparent;
		border-radius: 7px;
		font-size: 0.875rem;
		color: var(--ink-2);
		white-space: nowrap;
		transition:
			background-color 0.15s ease,
			color 0.15s ease;
	}
	.chip[aria-current] {
		background: var(--surface);
		border-color: var(--rule-2);
		color: var(--ink);
		font-weight: 500;
	}
	.search {
		flex: 0 1 19rem;
		min-width: 12rem;
	}
	.search .field {
		min-height: 38px;
		padding-block: 7px;
	}
	@media (hover: hover) and (pointer: fine) {
		.chip:hover {
			color: var(--ink);
		}
		tbody tr:hover {
			background: var(--surface);
		}
	}
	.ledger {
		margin-top: 14px;
		border: 1px solid var(--rule);
		border-radius: 12px;
		overflow: hidden;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
	}
	th {
		padding: 9px 14px;
		background: var(--surface);
		border-bottom: 1px solid var(--rule);
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--ink-2);
		text-align: left;
		white-space: nowrap;
	}
	td {
		padding: 13px 14px;
		vertical-align: top;
		font-size: 0.9375rem;
	}
	tbody tr + tr td {
		border-top: 1px solid var(--rule);
	}
	tbody tr {
		transition: background-color 0.12s ease;
	}
	.c-ref {
		width: 5.75rem;
	}
	td.c-ref {
		padding-top: 16px;
	}
	.c-by {
		width: 11.5rem;
	}
	.c-num {
		width: 4.5rem;
		text-align: right;
	}
	th.c-num:nth-child(4),
	td.c-num:nth-child(4) {
		width: 8.75rem;
	}
	td.c-num {
		padding-top: 15px;
	}
	.title {
		display: block;
		font-size: 1.0625rem;
		line-height: 1.32;
		overflow-wrap: anywhere;
	}
	@media (hover: hover) and (pointer: fine) {
		.title:hover {
			text-decoration: underline;
			text-decoration-thickness: 1px;
			text-underline-offset: 0.18em;
		}
	}
	.c-prompt .tag {
		margin-top: 6px;
	}
	.phone-by {
		display: none;
		margin-top: 6px;
	}
	.sum {
		display: block;
		font-weight: 500;
		white-space: nowrap;
	}
	.up {
		display: block;
		white-space: nowrap;
		font-size: 0.75rem;
		letter-spacing: 0;
		color: var(--signal);
	}
	td.c-num :global(.meter) {
		margin-top: 7px;
	}
	.none {
		display: grid;
		gap: 6px;
		padding-block: 40px;
		font-size: 1.125rem;
	}
	.none a {
		font-size: 0.9375rem;
	}
	.pages {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		margin-top: 20px;
	}
	.of {
		font-size: 0.8125rem;
		letter-spacing: 0;
		color: var(--ink-2);
	}
	@media (max-width: 860px) {
		.c-ref,
		.c-runs,
		.c-donors {
			display: none;
		}
		.c-by {
			width: 10.5rem;
		}
	}
	@media (max-width: 620px) {
		.c-by,
		.c-age {
			display: none;
		}
		.phone-by {
			display: flex;
		}
		.search {
			flex: 1 1 100%;
		}
		th.c-num:nth-child(4),
		td.c-num:nth-child(4) {
			width: 7.5rem;
		}
		td,
		th {
			padding-inline: 12px;
		}
		.sum {
			font-size: 0.875rem;
		}
	}
</style>
