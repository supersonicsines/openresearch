<script lang="ts">
	import { onMount } from 'svelte';
	import { refreshAll, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { postJson } from '#lib/client.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import KeyForm from '#lib/components/KeyForm.svelte';
	import { money, shortModelName, timeAgo } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let busyKey = $state(false);
	let replacing = $state(false);
	let confirmOpen = $state(false);
	let error = $state('');
	/** How an attempt to connect OpenRouter ended, where the visitor has just come back from one. */
	let keyOutcome = $state<string | null>(null);

	onMount(() => {
		keyOutcome = page.url.searchParams.get('openrouter');
		if (!keyOutcome) return;
		try {
			replaceState('/account', page.state);
		} catch {
			history.replaceState(history.state, '', '/account');
		}
	});

	const STATUS: Record<string, string> = {
		queued: 'Waiting to begin',
		running: 'In progress',
		completed: 'Finished',
		stopped: 'Stopped',
		failed: 'Could not be completed'
	};

	async function removeKey() {
		busyKey = true;
		error = '';
		const { ok, data: reply } = await postJson('/api/key', {}, 'DELETE');
		if (!ok) error = reply.message ?? 'The key could not be removed.';
		replacing = false;
		confirmOpen = false;
		await refreshAll();
		busyKey = false;
	}

	async function withdraw(proposalId: number) {
		error = '';
		const { ok, data: reply } = await postJson(`/api/proposals/${proposalId}/pledge`, {}, 'DELETE');
		if (!ok) error = reply.message ?? 'The pledge could not be withdrawn.';
		await refreshAll();
	}

	async function stop(publicId: string) {
		error = '';
		const { ok, data: reply } = await postJson(`/api/donations/${publicId}/stop`);
		if (!ok) error = reply.message ?? 'The donation could not be stopped.';
		await refreshAll();
	}
</script>

<svelte:head><title>Account · OpenResearch</title></svelte:head>

<div class="page">
	<h1 class="serif">Account</h1>

	{#if data.user}
		<section class="who">
			<Avatar src={data.user.avatar_url} handle={data.user.handle} size={48} />
			<div>
				<a class="at" href="/u/{data.user.handle}">@{data.user.handle}</a>
				{#if data.user.name !== data.user.handle}<p class="small muted">{data.user.name}</p>{/if}
			</div>
			<form method="POST" action="/auth/logout" class="out">
				<button class="btn btn-quiet btn-small" type="submit">Sign out</button>
			</form>
		</section>
	{/if}

	<section>
		<h2 class="serif">OpenRouter key</h2>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		{#if data.key && !replacing}
			{#if data.key.limit_micro === null}
				<div class="warning spaced" role="alert">
					<strong>This key has no spending limit.</strong>
					Any amount held in the OpenRouter account could be spent through it. A key with a limit should
					be created at <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer">openrouter.ai/settings/keys</a> and used in its place.
				</div>
			{/if}
			<dl class="facts">
				<div><dt>Key</dt><dd class="mono">{data.key.preview}</dd></div>
				<div>
					<dt>Spending limit</dt>
					<dd class="figures">{data.key.limit_micro === null ? 'None' : money(data.key.limit_micro)}</dd>
				</div>
				{#if data.key.remaining_micro !== null}
					<div><dt>Remaining</dt><dd class="figures">{money(data.key.remaining_micro)}</dd></div>
				{/if}
				<div><dt>Last checked</dt><dd>{timeAgo(data.key.checked_at)}</dd></div>
			</dl>
			<div class="row">
				<button class="btn btn-quiet btn-small" type="button" onclick={() => (replacing = true)}>Replace key</button>
				<button class="btn btn-danger btn-small" type="button" disabled={busyKey} onclick={() => (confirmOpen = true)}>Remove key</button>
			</div>
		{:else}
			<div><KeyForm onsaved={() => (replacing = false)} returnTo="/account" outcome={keyOutcome} /></div>
			{#if replacing}
				<button class="btn btn-quiet btn-small cancel" type="button" onclick={() => (replacing = false)}>Keep the current key</button>
			{/if}
		{/if}
	</section>

	<section>
		<h2 class="serif">Pledges</h2>
		{#if data.pledges.length === 0}
			<p class="muted">No pledges stand on this account.</p>
		{:else}
			<ul class="donations pledges">
				{#each data.pledges as g (g.id)}
					<li>
						<div class="line">
							<a class="title serif" href="/p/{g.slug}#next">{g.question}</a>
							<span class="figures sum">{money(g.amount_micro)}</span>
						</div>
						<div class="line small muted">
							<span>
								{#if g.status === 'standing'}
									Standing. Nothing is charged unless this question leads when its round closes.
								{:else}
									Not met. {g.reason}
								{/if}
								{shortModelName(g.model_name)}, {timeAgo(g.created_at)}.
							</span>
							{#if g.status === 'standing'}
								<button class="btn btn-quiet btn-small" type="button" onclick={() => withdraw(g.proposal_id)}>Withdraw</button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h2 class="serif">Donations</h2>
		{#if data.donations.length === 0}
			<p class="muted">No donations have been made from this account.</p>
		{:else}
			<ul class="donations">
				{#each data.donations as d (d.id)}
					<li>
						<div class="line">
							<a class="title serif" href="/p/{d.slug}">{d.title}</a>
							<span class="figures sum">{money(d.spent_micro)} of {money(d.amount_micro)}</span>
						</div>
						<div class="line small muted">
							<span>
								{STATUS[d.status]}{d.end_reason ? `. ${d.end_reason}` : '.'}
								{#if d.question}Pledged towards a question that led its round.{/if}
								{shortModelName(d.model_name)}, {d.run_count} {d.run_count === 1 ? 'run' : 'runs'}, {timeAgo(d.created_at)}.
							</span>
							{#if d.status === 'queued' || d.status === 'running'}
								<button class="btn btn-quiet btn-small" type="button" onclick={() => stop(d.public_id)}>Stop</button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<Dialog bind:open={confirmOpen} title="Remove this key">
	<p class="muted">The key will be deleted, and any donations in progress will be ended. Amounts already spent are not affected.</p>
	<div class="row confirm">
		<button class="btn btn-danger" type="button" disabled={busyKey} onclick={removeKey}>Remove key</button>
		<button class="btn btn-quiet" type="button" onclick={() => (confirmOpen = false)}>Keep key</button>
	</div>
</Dialog>

<style>
	.at {
		overflow-wrap: anywhere;
		font-family: var(--mono);
		font-size: 1.125rem;
		font-weight: 500;
		letter-spacing: -0.02em;
	}
	.confirm {
		margin-top: 18px;
	}
	.page {
		max-width: var(--measure);
		padding-top: 48px;
	}
	h1 {
		font-size: clamp(2rem, 1.6rem + 1.6vw, 2.75rem);
		line-height: 1.15;
		letter-spacing: -0.014em;
	}
	section {
		margin-top: 40px;
	}
	h2 {
		font-size: 1.375rem;
		margin-bottom: 14px;
	}
	.who {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 14px;
		margin-top: 24px;
	}
	.who > div {
		min-width: 0;
	}
	.out {
		margin-left: auto;
	}
	.spaced {
		margin-bottom: 16px;
	}
	.facts {
		display: grid;
		gap: 0;
		border-top: 1px solid var(--rule);
	}
	.facts > div {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding-block: 10px;
		border-bottom: 1px solid var(--rule);
	}
	dt {
		color: var(--ink-2);
	}
	.mono {
		font-family: var(--mono);
		font-size: 0.9375rem;
	}
	.row {
		display: flex;
		gap: 8px;
		margin-top: 14px;
	}
	.cancel {
		margin-top: 8px;
	}
	.donations li {
		display: grid;
		gap: 6px;
		padding-block: 16px;
	}
	.donations li + li {
		border-top: 1px solid var(--rule);
	}
	.line {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 16px;
	}
	.title {
		min-width: 0;
		overflow-wrap: anywhere;
		font-size: 1.125rem;
		line-height: 1.3;
	}
	@media (hover: hover) and (pointer: fine) {
		.title:hover {
			color: var(--accent);
		}
	}
	.sum {
		flex: none;
	}
	@media (max-width: 560px) {
		.page {
			padding-top: 24px;
		}
		.line {
			flex-direction: column;
			gap: 4px;
		}
		.line .btn {
			margin-top: 6px;
		}
	}
</style>
