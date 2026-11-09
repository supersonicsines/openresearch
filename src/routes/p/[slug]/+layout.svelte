<script lang="ts">
	import { page } from '$app/state';
	import { fade, fly } from 'svelte/transition';
	import DonateDialog from '#lib/components/DonateDialog.svelte';
	import Handle from '#lib/components/Handle.svelte';
	import Meter from '#lib/components/Meter.svelte';
	import ReportDialog from '#lib/components/ReportDialog.svelte';
	import ShareDialog from '#lib/components/ShareDialog.svelte';
	import Spark from '#lib/components/Spark.svelte';
	import Tabs from '#lib/components/Tabs.svelte';
	import XMark from '#lib/components/XMark.svelte';
	import { fullDate, milestone, money, plural, reference, wholeMoney } from '#lib/format.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let donateOpen = $state(false);
	let shareOpen = $state(false);
	let reportOpen = $state(false);
	/** Set after a donation, so that the share dialog offers that donation's own card. */
	let justDonated = $state<{ id: string; amount: number } | null>(null);

	let toastTimer: ReturnType<typeof setTimeout>;

	function donated(id: string, amount: number) {
		justDonated = { id, amount };
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => {
			// A card that is being viewed is not taken away.
			if (!shareOpen) justDonated = null;
		}, 12_000);
	}

	const project = $derived(data.project);
	const base = $derived(`/p/${project.slug}`);
	const path = $derived(page.url.pathname);
	const tabs = $derived([
		{ href: base, label: 'Findings', active: path === base },
		{ href: `${base}/runs`, label: 'Runs', active: path.startsWith(`${base}/runs`), count: project.runs },
		{ href: `${base}/repository`, label: 'Repository', active: path.startsWith(`${base}/repository`) }
	]);

	const size = $derived(
		project.prompt.length < 110 ? 'large' : project.prompt.length < 320 ? 'medium' : 'small'
	);

	const shareCard = $derived(
		justDonated ? `/card/donation/${justDonated.id}.png` : `/card/project/${project.slug}.png`
	);
	const shareLink = $derived(
		`${page.url.origin}${base}${justDonated ? `?d=${justDonated.id}` : ''}`
	);
	const sharePost = $derived(
		justDonated
			? `A donation of up to ${money(justDonated.amount)} has been pledged towards this research on OpenSearch.`
			: project.spent > 0
				? `${reference(project.id)} has raised ${money(project.spent)} on OpenSearch. It was submitted by @${project.author_handle}.`
				: `${reference(project.id)} has been listed on OpenSearch by @${project.author_handle}, and it has not yet been funded.`
	);

	const metaImage = $derived(
		data.sharedDonation
			? `${page.url.origin}/card/donation/${data.sharedDonation.id}.png`
			: `${page.url.origin}/card/project/${project.slug}.png`
	);
	const metaDescription = $derived(
		`${money(project.spent)} raised, ${plural(project.runs, 'run')} completed. Submitted by @${project.author_handle}. The findings are published in a public repository.`
	);
</script>

<svelte:head>
	<title>{project.title} · OpenSearch</title>
	<meta name="description" content={metaDescription} />
	<meta property="og:type" content="article" />
	<meta property="og:title" content={project.title} />
	<meta property="og:description" content={metaDescription} />
	<meta property="og:image" content={metaImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={project.title} />
	<meta name="twitter:description" content={metaDescription} />
	<meta name="twitter:image" content={metaImage} />
</svelte:head>

{#snippet supporters()}
	{#if data.donors.length}
		<div class="donors">
			<p class="small muted heading">{plural(project.donors, 'donor')}</p>
			<ul>
				{#each data.donors as donor (donor.handle)}
					<li>
						<Handle handle={donor.handle} avatar={donor.avatar_url} size={22} />
						<span class="figures amount">{money(donor.spent)}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
	<button class="report" type="button" onclick={() => (reportOpen = true)}>Report this project</button>
{/snippet}

<article class="project">
	<header class="top">
		<h1 class="serif prompt {size}">{project.prompt}</h1>
		<div class="by">
			<span class="ref">{reference(project.id)}</span>
			<span class="author">
				<Handle handle={project.author_handle} avatar={project.author_avatar} size={26} strong />
				<a class="on-x" href="https://x.com/{project.author_handle}" target="_blank" rel="noopener noreferrer" aria-label="@{project.author_handle} on X"><XMark size={12} /></a>
			</span>
			<span class="muted when">Submitted on {fullDate(project.created_at)}</span>
		</div>
	</header>

	<div class="grid">
		<aside class="rail">
			<div class="funding">
				{#key project.spent}
					<p class="sum figures" in:fly={{ y: 5, duration: 220 }}>{money(project.spent)}</p>
				{/key}
				<p class="small muted">
					raised{#if project.pending > 0}, with a further {money(project.pending)} pledged{/if}
				</p>
				<div class="progress">
					<Meter spent={project.spent} pending={project.pending} />
					<p class="figures to">of the {wholeMoney(milestone(project.spent))} milestone</p>
				</div>
				{#if project.active}<p class="tag state"><span class="dot" aria-hidden="true"></span>In progress</p>{/if}
			</div>
			{#if data.series.length > 1}
				<div class="history"><Spark points={data.series} height={56} interactive /></div>
			{/if}
			<div class="buttons">
				<button class="btn btn-signal btn-wide" type="button" onclick={() => (donateOpen = true)}>Donate</button>
				<button
					class="btn btn-quiet btn-wide"
					type="button"
					onclick={() => {
						justDonated = null;
						shareOpen = true;
					}}
				>Generate a card</button>
			</div>
			{@render supporters()}
		</aside>

		<div class="content">
			<Tabs items={tabs} label="Project sections" noscroll />
			<div class="panel">
				{@render children()}
			</div>
			<!-- On a narrow screen these follow the findings, since the rail above them has no room. -->
			<div class="below">{@render supporters()}</div>
		</div>
	</div>
</article>

{#if justDonated}
	<div class="toast" role="status" in:fly={{ y: 12, duration: 240 }} out:fade={{ duration: 120 }}>
		<p>A donation of up to {money(justDonated.amount)} has been recorded.</p>
		<div>
			<button class="btn btn-small toast-share" type="button" onclick={() => (shareOpen = true)}>Generate a card</button>
			<button class="dismiss" type="button" aria-label="Dismiss" onclick={() => (justDonated = null)}>
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
			</button>
		</div>
	</div>
{/if}

<div class="sticky" aria-hidden={donateOpen}>
	<button class="btn btn-signal btn-wide" type="button" onclick={() => (donateOpen = true)}>Donate</button>
</div>

<ReportDialog bind:open={reportOpen} slug={project.slug} />

<DonateDialog
	bind:open={donateOpen}
	slug={project.slug}
	signedIn={Boolean(data.user)}
	keyInfo={data.key}
	ondonated={donated}
/>

<ShareDialog
	bind:open={shareOpen}
	title={justDonated ? 'Share this donation' : 'Share this project'}
	cardUrl={shareCard}
	shareUrl={shareLink}
	postText={sharePost}
	fileName="opensearch-{project.slug}.png"
/>

<style>
	.top {
		padding-block: 44px 36px;
		max-width: 52rem;
	}
	.prompt {
		overflow-wrap: anywhere;
		text-wrap: pretty;
		white-space: pre-line;
	}
	.prompt.large {
		font-size: clamp(2rem, 1.3rem + 2.6vw, 3rem);
		line-height: 1.13;
		letter-spacing: -0.016em;
	}
	.prompt.medium {
		font-size: clamp(1.625rem, 1.25rem + 1.6vw, 2.25rem);
		line-height: 1.2;
		letter-spacing: -0.012em;
	}
	.prompt.small {
		font-size: clamp(1.1875rem, 1.05rem + 0.6vw, 1.4375rem);
		line-height: 1.42;
	}
	.by {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 16px;
		margin-top: 18px;
		font-size: 0.875rem;
	}
	.author {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.on-x {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		flex: none;
		border-radius: 6px;
		color: var(--ink-2);
		transition: color 0.15s ease;
	}
	@media (hover: hover) and (pointer: fine) {
		.on-x:hover {
			color: var(--ink);
		}
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(0, var(--measure)) 256px;
		justify-content: space-between;
		gap: 56px;
		align-items: start;
	}
	.content {
		grid-column: 1;
		grid-row: 1;
		min-width: 0;
	}
	.rail {
		grid-column: 2;
		grid-row: 1;
		position: sticky;
		top: 24px;
		display: grid;
		gap: 16px;
	}
	.sum {
		font-size: 2.125rem;
		font-weight: 500;
		line-height: 1.1;
		letter-spacing: -0.035em;
	}
	.progress {
		display: grid;
		gap: 6px;
		margin-top: 10px;
	}
	.to {
		font-size: 0.75rem;
		letter-spacing: 0;
		color: var(--ink-2);
	}
	.state {
		margin-top: 10px;
	}
	.report {
		justify-self: start;
		padding-block: 4px;
		margin-block: -4px;
		font-size: 0.8125rem;
		color: var(--ink-2);
		text-decoration: underline;
		text-decoration-color: var(--rule-2);
		text-underline-offset: 0.2em;
	}
	.buttons {
		display: grid;
		gap: 8px;
	}
	.heading {
		padding-bottom: 8px;
		border-bottom: 1px solid var(--rule);
	}
	.donors li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding-block: 6px;
	}
	.amount {
		flex: none;
		font-size: 0.8125rem;
		color: var(--ink-2);
	}
	.panel {
		padding-top: 28px;
	}
	.toast {
		position: fixed;
		z-index: 5;
		left: 50%;
		bottom: calc(24px + env(safe-area-inset-bottom));
		translate: -50% 0;
		display: flex;
		align-items: center;
		gap: 14px;
		width: max-content;
		max-width: calc(100vw - 32px);
		padding: 10px 10px 10px 18px;
		background: var(--ink);
		color: var(--bg);
		border-radius: 12px;
		box-shadow: var(--shadow);
		font-size: 0.9375rem;
	}
	.toast > div {
		display: flex;
		align-items: center;
		gap: 2px;
		flex: none;
	}
	.toast-share {
		background: var(--bg);
		color: var(--ink);
	}
	.dismiss {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
	}
	.sticky,
	.below {
		display: none;
	}
	@media (max-width: 860px) {
		.top {
			padding-block: 24px 24px;
		}
		.grid {
			grid-template-columns: minmax(0, 1fr);
			gap: 24px;
		}
		.rail,
		.content {
			grid-column: 1;
			grid-row: auto;
		}
		.rail {
			position: static;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
		}
		.rail .btn-signal,
		.rail .donors,
		.rail .report,
		.history {
			display: none;
		}
		.below {
			display: grid;
			gap: 16px;
			margin-top: 36px;
		}
		.buttons .btn {
			width: auto;
			min-height: 34px;
			padding-inline: 12px;
			font-size: 0.875rem;
		}
		.funding {
			display: flex;
			align-items: baseline;
			gap: 8px;
			flex-wrap: wrap;
			min-width: 0;
		}
		.sticky {
			display: block;
			position: sticky;
			z-index: 4;
			bottom: 0;
			margin-inline: calc(var(--gutter) * -1);
			margin-top: 32px;
			padding: 10px var(--gutter) calc(10px + env(safe-area-inset-bottom));
			background: color-mix(in srgb, var(--bg) 88%, transparent);
			backdrop-filter: blur(14px);
			-webkit-backdrop-filter: blur(14px);
			border-top: 1px solid var(--rule);
		}
		.toast {
			bottom: calc(72px + env(safe-area-inset-bottom));
		}
	}
</style>
