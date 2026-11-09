<script lang="ts">
	import { page } from '$app/state';
	import Avatar from '#lib/components/Avatar.svelte';
	import ShareDialog from '#lib/components/ShareDialog.svelte';
	import XMark from '#lib/components/XMark.svelte';
	import { money, plural } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let shareOpen = $state(false);
	const own = $derived(page.data.user?.handle === data.person.handle);
	const description = $derived(
		`${money(data.stats.spent)} donated by @${data.person.handle} towards ${plural(data.stats.projects, 'project')} on OpenResearch.`
	);
</script>

<svelte:head>
	<title>@{data.person.handle} · OpenResearch</title>
	<meta name="description" content={description} />
	<meta property="og:title" content="@{data.person.handle} on OpenResearch" />
	<meta property="og:description" content={description} />
	<meta property="og:image" content="{page.url.origin}/card/donor/{data.person.handle}.png" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image" content="{page.url.origin}/card/donor/{data.person.handle}.png" />
</svelte:head>

<div class="head">
	<Avatar src={data.person.avatar_url} handle={data.person.handle} size={72} />
	<div class="who">
		<h1 class="at">@{data.person.handle}</h1>
		<p class="named muted">
			{#if data.person.name !== data.person.handle}<span>{data.person.name}</span>{/if}
			<a class="link x" href="https://x.com/{data.person.handle}" target="_blank" rel="noopener noreferrer"><XMark size={12} /> View on X</a>
		</p>
	</div>
	<button class="btn btn-quiet btn-small share" type="button" onclick={() => (shareOpen = true)}>
		{own ? 'Generate a card' : 'Share'}
	</button>
</div>

<dl class="stats">
	<div><dd class="figures">{money(data.stats.spent)}</dd><dt>Donated</dt></div>
	<div><dd class="figures">{data.stats.rank ? `${data.stats.rank}` : 'Unplaced'}</dd><dt>Place on the leaderboard</dt></div>
	<div><dd class="figures">{data.stats.projects}</dd><dt>{data.stats.projects === 1 ? 'Project' : 'Projects'} funded</dt></div>
	<div><dd class="figures">{data.stats.runs}</dd><dt>{data.stats.runs === 1 ? 'Run' : 'Runs'} funded</dt></div>
</dl>

<section>
	<h2 class="serif">Projects funded</h2>
	{#if data.funded.length === 0}
		<p class="muted">No donations have been spent as yet.</p>
	{:else}
		<ul>
			{#each data.funded as p (p.slug)}
				<li><a href="/p/{p.slug}"><span class="serif title">{p.title}</span><span class="figures amount">{money(p.spent)}</span></a></li>
			{/each}
		</ul>
	{/if}
</section>

{#if data.submitted.length}
	<section>
		<h2 class="serif">Prompts submitted</h2>
		<ul>
			{#each data.submitted as p (p.slug)}
				<li><a href="/p/{p.slug}"><span class="serif title">{p.title}</span><span class="figures amount">{money(p.spent)}</span></a></li>
			{/each}
		</ul>
	</section>
{/if}

<ShareDialog
	bind:open={shareOpen}
	title={`Share @${data.person.handle}`}
	cardUrl="/card/donor/{data.person.handle}.png"
	shareUrl="{page.url.origin}/u/{data.person.handle}"
	postText={`Donations made by @${data.person.handle} towards research on OpenResearch.`}
	fileName="openresearch-{data.person.handle}.png"
/>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 18px;
		padding-top: 48px;
	}
	.who {
		min-width: 0;
	}
	.at {
		font-family: var(--mono);
		font-size: clamp(1.5rem, 1.2rem + 1.2vw, 2.125rem);
		font-weight: 500;
		line-height: 1.15;
		letter-spacing: -0.03em;
		overflow-wrap: anywhere;
	}
	.named {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px 14px;
		margin-top: 4px;
		font-size: 0.9375rem;
	}
	.x {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.share {
		margin-left: auto;
		flex: none;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 16px;
		margin-top: 36px;
		padding-block: 20px;
		border-block: 1px solid var(--rule);
	}
	.stats > div {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	dd {
		font-size: 1.625rem;
		line-height: 1.2;
	}
	dt {
		font-size: 0.875rem;
		color: var(--ink-2);
	}
	section {
		margin-top: 40px;
	}
	h2 {
		font-size: 1.375rem;
		margin-bottom: 8px;
	}
	li + li {
		border-top: 1px solid var(--rule);
	}
	li a {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 32px;
		padding-block: 14px;
	}
	.title {
		min-width: 0;
		overflow-wrap: anywhere;
		font-size: 1.125rem;
		line-height: 1.3;
		transition: color 0.15s ease;
	}
	@media (hover: hover) and (pointer: fine) {
		li a:hover .title {
			color: var(--accent);
		}
	}
	.amount {
		flex: none;
		font-size: 1.125rem;
	}
	@media (max-width: 560px) {
		.head {
			padding-top: 24px;
			flex-wrap: wrap;
		}
		.share {
			margin-left: 0;
			width: 100%;
		}
		.stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
