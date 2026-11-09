<script lang="ts">
	import Board from '#lib/components/Board.svelte';
	import StageDemo from '#lib/components/StageDemo.svelte';
	import Tabs from '#lib/components/Tabs.svelte';
	import { money, plural, reference, timeAgo } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const tabs = $derived([
		{ href: '/?sort=donated', label: 'Most funded', active: data.sort === 'donated' },
		{ href: '/?sort=rising', label: 'Rising', active: data.sort === 'rising' },
		{ href: '/?sort=recent', label: 'Newest', active: data.sort === 'recent' }
	]);

	const DAY = 86_400_000;
	const entries = $derived(
		data.projects.map((p) => ({
			key: String(p.id),
			href: `/p/${p.slug}`,
			spent: p.spent,
			pending: p.pending,
			recent: p.spent_24h,
			title: p.title,
			reference: reference(p.id),
			by: { handle: p.author_handle, avatar: p.author_avatar },
			meta: `${plural(p.runs, 'run')}, ${plural(p.donors, 'donor')}`,
			note: data.sort === 'recent' || !p.runs ? `Submitted ${timeAgo(p.created_at)}` : `Updated ${timeAgo(p.last_at)}`,
			live: Boolean(p.active),
			fresh: Date.now() - p.created_at < DAY,
			series: data.series[p.id]
		}))
	);
	const ranked = $derived(data.sort === 'donated');
	const closing = $derived.by(() => {
		const remaining = data.total - data.projects.length;
		if (remaining > 0) {
			return {
				href: `/prompts?sort=${data.sort === 'donated' ? 'donated' : 'recent'}`,
				title: `See all ${plural(data.total, 'prompt')}`,
				note: `${plural(remaining, 'further prompt')} on the full list.`
			};
		}
		return ranked
			? { href: '/submit', title: 'This place is vacant.', note: 'A prompt of up to 250 words may be submitted.', numbered: true }
			: { href: '/submit', title: 'A further prompt may be submitted.', note: '250 words at most.' };
	});
	const stats = $derived([
		{ value: money(data.totals.spent), label: 'raised' },
		{ value: data.totals.runs.toLocaleString('en-GB'), label: data.totals.runs === 1 ? 'run' : 'runs' },
		{ value: data.totals.donors.toLocaleString('en-GB'), label: data.totals.donors === 1 ? 'donor' : 'donors' },
		{ value: data.totals.live.toLocaleString('en-GB'), label: 'in progress' }
	]);
</script>

<section class="intro">
	<div class="pitch">
		<h1 class="serif">Any prompt may be listed. Those that are funded are researched in public.</h1>
		<p class="muted">
			Funding comes from donors' own OpenRouter keys, and every run is committed to an open repository.
			<a class="link" href="/about">The process is described here.</a>
		</p>
		<a class="btn btn-primary cta" href="/submit">Submit a prompt</a>
	</div>
	{#if data.total > 0}
		<dl class="stats-strip" aria-label="Site totals">
			{#each stats as stat (stat.label)}
				<div><dd class="figures">{stat.value}</dd><dt>{stat.label}</dt></div>
			{/each}
		</dl>
	{/if}
</section>

{#if data.total === 0}
	<Board
		entries={[]}
		label="Projects"
		closing={{ href: '/submit', title: 'First place is vacant.', note: 'No prompts have been submitted as yet. A prompt of up to 250 words may be submitted.', numbered: true }}
	>
		{#snippet content()}{/snippet}
	</Board>
	<div class="explain"><StageDemo /></div>
{:else}
	<div class="toolbar">
		<Tabs items={tabs} label="Sort projects" noscroll />
		<p class="toolbar-end"><a class="link" href="/prompts">{data.total === 1 ? 'See the full list' : `See all ${plural(data.total, 'prompt')}`}</a></p>
	</div>
	<Board {entries} {ranked} label="Projects" {closing}>
		{#snippet content(entry)}<span>{entry.title}</span>{/snippet}
	</Board>
{/if}

<style>
	/* The two columns of the introduction share the centre line of the board below. */
	.intro {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 20px 24px;
		align-items: end;
		padding-block: 32px 28px;
	}
	.pitch {
		display: grid;
		gap: 10px;
		justify-items: start;
		padding-right: 12px;
	}
	h1 {
		font-size: clamp(1.625rem, 1.25rem + 1.1vw, 2.125rem);
		line-height: 1.14;
		letter-spacing: -0.012em;
		text-wrap: pretty;
	}
	.pitch p {
		max-width: 30rem;
		font-size: 0.9375rem;
	}
	.cta {
		margin-top: 6px;
	}
	.explain {
		margin-top: 32px;
	}
	@media (max-width: 720px) {
		.intro {
			grid-template-columns: minmax(0, 1fr);
			padding-block: 22px 20px;
		}
		.pitch {
			padding-right: 0;
		}
		h1 {
			font-size: 1.625rem;
		}
	}
</style>
