<script lang="ts">
	import { fade } from 'svelte/transition';
	import Avatar from '#lib/components/Avatar.svelte';
	import Board from '#lib/components/Board.svelte';
	import ShareDialog from '#lib/components/ShareDialog.svelte';
	import Tabs from '#lib/components/Tabs.svelte';
	import { page } from '$app/state';
	import { plural, reference } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let shareOpen = $state(false);

	const boards = $derived([
		{ href: `/leaderboards?board=projects&period=${data.period}`, label: 'Projects', active: data.board === 'projects' },
		{ href: `/leaderboards?board=donors&period=${data.period}`, label: 'Donations', active: data.board === 'donors' }
	]);
	const periods = $derived([
		{ value: 'all', label: 'All time' },
		{ value: '30', label: '30 days' },
		{ value: '7', label: '7 days' }
	]);

	const myIndex = $derived(data.me ? data.donors.findIndex((d) => d.handle === data.me) : -1);

	const projects = $derived(
		data.projects.map((row) => ({
			key: row.slug,
			href: `/p/${row.slug}`,
			spent: row.spent,
			title: row.title,
			reference: reference(row.id),
			by: { handle: row.author_handle, avatar: row.author_avatar },
			meta: `${plural(row.runs, 'run')}, ${plural(row.donors, 'donor')}`
		}))
	);
	const donors = $derived(
		data.donors.map((row) => ({
			key: row.handle,
			href: `/u/${row.handle}`,
			spent: row.spent,
			handle: row.handle,
			avatar: row.avatar_url,
			meta: `${plural(row.projects, 'project')}, ${plural(row.runs, 'run')}`,
			mine: row.handle === data.me
		}))
	);
</script>

<svelte:head><title>Leaderboards · OpenResearch</title></svelte:head>

<div class="head">
	<h1 class="serif">Leaderboards</h1>
	<p class="muted">Calculated from amounts actually spent on completed runs, as reported by OpenRouter. Pledges are not counted until they have been spent.</p>
</div>

<div class="toolbar">
	<Tabs items={boards} label="Leaderboard" noscroll />
	<div class="periods toolbar-end" role="group" aria-label="Period">
		{#each periods as p (p.value)}
			<a
				href="/leaderboards?board={data.board}&period={p.value}"
				aria-current={data.period === p.value ? 'true' : undefined}
				data-sveltekit-reset="false"
			>{p.label}</a>
		{/each}
	</div>
</div>

{#if data.board === 'projects'}
	{#if projects.length === 0}
		<p class="none serif" in:fade={{ duration: 160 }}>No donations have been spent in this period.</p>
	{:else}
		<Board
			entries={projects}
			label="Projects by amount spent"
			closing={{ href: '/submit', title: 'This place is vacant.', note: 'A prompt of up to 250 words may be submitted.', numbered: true }}
		>
			{#snippet content(entry)}<span>{entry.title}</span>{/snippet}
		</Board>
	{/if}
{:else if donors.length === 0}
	<p class="none serif" in:fade={{ duration: 160 }}>No donations have been spent in this period.</p>
{:else}
	{#if myIndex >= 0}
		<div class="mine">
			<p class="small">This account is placed {myIndex + 1} of {donors.length} in this period.</p>
			<button class="btn btn-quiet btn-small" type="button" onclick={() => (shareOpen = true)}>Generate a card</button>
		</div>
	{/if}
	<Board
		entries={donors}
		label="Donors by amount spent"
		unit="donated"
		milestones={false}
		closing={{ href: '/', title: 'This place is vacant.', note: 'It may be taken by donating to any project.', numbered: true }}
	>
		{#snippet content(entry, tier)}
			<span class="who">
				<Avatar src={entry.avatar} handle={entry.handle} size={tier === 'lead' ? 56 : 32} />
				<span class="handle">@{entry.handle}</span>
			</span>
		{/snippet}
	</Board>
{/if}

{#if data.me}
	<ShareDialog
		bind:open={shareOpen}
		title="Share these donations"
		cardUrl="/card/donor/{data.me}.png"
		shareUrl="{page.url.origin}/u/{data.me}"
		postText="Donations made by @{data.me} towards research on OpenResearch."
		fileName="openresearch-{data.me}.png"
	/>
{/if}

<style>
	.head {
		padding-block: 40px 28px;
	}
	h1 {
		font-size: clamp(1.625rem, 1.2rem + 1.5vw, 2.25rem);
		line-height: 1.16;
		letter-spacing: -0.012em;
	}
	.head p {
		margin-top: 8px;
		max-width: var(--measure);
	}
	.periods {
		display: flex;
		gap: 16px;
	}
	.periods a {
		color: var(--ink-2);
		transition: color 0.15s ease;
	}
	.periods a[aria-current] {
		color: var(--ink);
		font-weight: 500;
	}
	@media (hover: hover) and (pointer: fine) {
		.periods a:hover {
			color: var(--ink);
		}
	}
	.who {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.handle {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--mono);
		font-weight: 500;
		letter-spacing: -0.02em;
	}
	.none {
		padding-block: 32px;
		font-size: 1.25rem;
		color: var(--ink-2);
	}
	.mine {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 16px;
		padding: 10px 10px 10px 14px;
		background: var(--surface);
		border-radius: 10px;
	}
	@media (max-width: 560px) {
		.head {
			padding-block: 24px 16px;
		}
		.periods {
			gap: 12px;
		}
	}
</style>
