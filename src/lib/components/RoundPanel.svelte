<script lang="ts" module>
	import type { PledgeTarget } from './DonateDialog.svelte';

	/** Provided by the project page, which holds the dialog in which a pledge is made. */
	export type RoundContext = { back: (target: PledgeTarget) => void };
	export const ROUND_CONTEXT = 'openresearch.round';
</script>

<script lang="ts">
	import { getContext, onMount, tick } from 'svelte';
	import { refreshAll, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { postJson } from '#lib/client.ts';
	import { fullDate, money, plural } from '#lib/format.ts';
	import { AUDIT_QUESTION } from '#lib/round.ts';
	import type { RoundProposal, RoundView } from '#lib/server/rounds.ts';
	import Countdown from './Countdown.svelte';
	import Handle from './Handle.svelte';
	import ProposeDialog from './ProposeDialog.svelte';

	let {
		slug,
		round,
		now,
		signedIn,
		suggestions
	}: {
		slug: string;
		round: RoundView;
		now: number;
		signedIn: boolean;
		/** The questions listed by the editor, any of which may be put forward. */
		suggestions: string[];
	} = $props();

	const context = getContext<RoundContext>(ROUND_CONTEXT);

	let proposeOpen = $state(false);
	let draft = $state('');
	let error = $state('');
	let busy = $state(0);

	type Row = Omit<RoundProposal, 'id'> & { id: number | null };

	/** The standing question closes the list until it has been backed, after which it is ranked with the rest. */
	const rows = $derived<Row[]>(
		round.proposals.some((p) => p.kind === 'audit')
			? round.proposals
			: [
					...round.proposals,
					{ id: null, kind: 'audit', question: AUDIT_QUESTION, handle: '', avatar_url: null, pledged: 0, backers: 0, mine: 0, withdrawable: false }
				]
	);
	const asked = $derived(round.proposals.filter((p) => p.kind === 'question').length);

	function back(row: Row) {
		error = '';
		context.back({ id: row.id, question: row.question, kind: row.kind, mine: row.mine });
	}

	function propose(text = '') {
		error = '';
		if (text) draft = text;
		proposeOpen = true;
	}

	async function withdraw(row: Row, what: 'pledge' | 'question') {
		if (row.id === null || busy) return;
		busy = row.id;
		error = '';
		try {
			const { ok, data } = await postJson(
				what === 'pledge' ? `/api/proposals/${row.id}/pledge` : `/api/proposals/${row.id}`,
				{},
				'DELETE'
			);
			if (!ok) error = data.message ?? `The ${what} could not be withdrawn.`;
			await refreshAll();
		} catch {
			error = `The ${what} could not be withdrawn. The connection should be examined and the attempt repeated.`;
		} finally {
			busy = 0;
		}
	}

	/** A round that has just closed is settled within seconds. The page is read again until it has been. */
	function closed() {
		let tries = 0;
		const timer = setInterval(async () => {
			await refreshAll();
			if (++tries >= 10 || !round.closesAt || round.closesAt > Date.now()) clearInterval(timer);
		}, 4000);
	}

	// After GitHub or OpenRouter has been connected, the visitor is returned to what was being done.
	onMount(() => {
		const params = page.url.searchParams;
		const wanted = params.get('back');
		if (wanted) {
			const row = rows.find((r) => (wanted === 'audit' ? r.kind === 'audit' : r.id === Number(wanted)));
			if (row) back(row);
		} else if (params.get('propose')) {
			// The research tree sends a question here to be proposed, with its text.
			propose((params.get('q') ?? '').slice(0, 2000));
		}
		// The marks are taken out of the address, so that the dialog does not open again on a reload.
		if (!['back', 'propose', 'q'].some((name) => params.has(name))) return;
		const clean = new URL(page.url.href);
		for (const name of ['back', 'propose', 'q']) clean.searchParams.delete(name);
		tick().then(() => {
			try {
				replaceState(clean, page.state);
			} catch {
				history.replaceState(history.state, '', clean);
			}
		});
	});
</script>

<section class="round" id="next" aria-labelledby="next-heading">
	<header>
		<h2 class="serif" id="next-heading">The next question</h2>
		<p class="state figures" role="status">
			Round {round.round}{' '}{#if round.closesAt}<Countdown closesAt={round.closesAt} {now} onclosed={closed} />{:else}opens with the first pledge{/if}
		</p>
	</header>
	<p class="small muted how">
		The question with the most pledged when a round closes is researched with those pledges. Nothing is
		charged for the other questions, and what was pledged towards them stands for the next round.
	</p>

	{#if error}<p class="error problem" role="alert">{error}</p>{/if}

	<ol class="questions">
		{#each rows as row, i (row.id ?? 'audit')}
			<li class:leading={i === 0 && row.pledged > 0}>
				<span class="place" aria-hidden={row.pledged === 0}>{row.pledged > 0 ? i + 1 : ''}</span>
				<div class="what">
					<p class="serif question">{row.question}</p>
					<p class="meta small muted">
						{#if row.kind === 'audit'}
							<span>A standing question on every project</span>
						{:else}
							<span class="by">Proposed by{' '}<Handle handle={row.handle} avatar={row.avatar_url} size={18} /></span>
						{/if}
						{#if row.backers > 0}<span>{plural(row.backers, 'backer')}</span>{/if}
						{#if i === 0 && row.pledged > 0}<span class="tag">Leading</span>{/if}
					</p>
					{#if row.mine > 0}
						<p class="mine small">
							<span><span class="figures">{money(row.mine)}</span>{' '}pledged from this account.</span>
							<button class="text" type="button" disabled={busy === row.id} onclick={() => withdraw(row, 'pledge')}>Withdraw pledge</button>
						</p>
					{/if}
					{#if row.withdrawable}
						<p class="mine small">
							<button class="text" type="button" disabled={busy === row.id} onclick={() => withdraw(row, 'question')}>Withdraw question</button>
						</p>
					{/if}
				</div>
				<div class="side">
					{#if row.pledged > 0}
						<p class="total"><span class="figures amount">{money(row.pledged)}</span>{' '}<span class="small muted">pledged</span></p>
					{:else}
						<p class="total small muted">No pledges</p>
					{/if}
					<button
						class="btn btn-quiet btn-small"
						type="button"
						aria-label="{row.mine > 0 ? 'Change pledge' : 'Back'}: {row.question}"
						onclick={() => back(row)}
					>{row.mine > 0 ? 'Change pledge' : 'Back'}</button>
				</div>
			</li>
		{/each}
	</ol>

	<div class="actions">
		<button class="btn btn-primary" type="button" onclick={() => propose()}>Propose a question</button>
		{#if asked === 0}<p class="small muted">No question has been proposed as yet.</p>{/if}
	</div>

	{#if round.last}
		<div class="last">
			<p class="small muted">
				Round {round.last.round} was settled on {fullDate(round.last.settled_at)}.
				{money(round.last.pledged)} from {plural(round.last.backers, 'backer')} went to the question that led:
			</p>
			<p class="serif past">{round.last.question}</p>
		</div>
	{/if}

	{#if suggestions.length}
		<div class="listed">
			<h3 class="serif">Open questions</h3>
			<p class="small muted">
				These are listed by the editor after each run, and an ordinary donation works through them in order.
				Any of them may be proposed for the round.
			</p>
			<ol>
				{#each suggestions as suggestion}
					<li>
						<span class="serif">{suggestion}</span>
						<button class="text small" type="button" aria-label="Propose: {suggestion}" onclick={() => propose(suggestion)}>Propose</button>
					</li>
				{/each}
			</ol>
		</div>
	{/if}
</section>

<ProposeDialog
	bind:open={proposeOpen}
	bind:draft
	{slug}
	{signedIn}
	onproposed={(id, question) => context.back({ id, question, kind: 'question', mine: 0 })}
/>

<style>
	.round {
		margin-top: 48px;
		padding-top: 28px;
		border-top: 1px solid var(--rule);
		scroll-margin-top: 24px;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 20px;
	}
	h2 {
		font-size: 1.375rem;
	}
	.state {
		font-size: 0.8125rem;
		letter-spacing: 0;
		color: var(--signal);
	}
	.how {
		margin-top: 10px;
		max-width: 36rem;
	}
	.problem {
		margin-top: 14px;
	}
	.questions {
		margin-top: 20px;
		border-block: 1px solid var(--rule);
	}
	.questions > li {
		display: grid;
		grid-template-columns: 1.75rem minmax(0, 1fr) auto;
		gap: 4px 12px;
		align-items: start;
		padding-block: 16px;
	}
	.questions > li + li {
		border-top: 1px solid var(--rule);
	}
	/* Places are set as they are on the board: in the italic, with old-style figures. */
	.place {
		font: italic 400 1.625rem/1.05 var(--serif);
		font-variant-numeric: oldstyle-nums;
		color: var(--ink-3);
	}
	.leading .place {
		color: var(--ink);
	}
	.what {
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	.question {
		overflow-wrap: anywhere;
		font-size: 1.125rem;
		line-height: 1.34;
		text-wrap: pretty;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px 14px;
		min-width: 0;
	}
	.by {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		max-width: 100%;
	}
	.mine {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px 12px;
	}
	.text {
		padding-block: 4px;
		margin-block: -4px;
		color: var(--ink-2);
		text-decoration: underline;
		text-decoration-color: var(--rule-2);
		text-underline-offset: 0.2em;
	}
	.text:disabled {
		opacity: 0.5;
	}
	.side {
		display: grid;
		justify-items: end;
		gap: 8px;
	}
	.total {
		white-space: nowrap;
	}
	.amount {
		font-size: 1.0625rem;
		font-weight: 500;
	}
	.leading .amount {
		color: var(--signal);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 16px;
		margin-top: 18px;
	}
	.last {
		margin-top: 28px;
	}
	.past {
		margin-top: 6px;
		padding-left: 14px;
		border-left: 2px solid var(--rule-2);
		overflow-wrap: anywhere;
		line-height: 1.4;
	}
	.listed {
		margin-top: 40px;
	}
	h3 {
		font-size: 1.125rem;
		margin-bottom: 4px;
	}
	.listed ol {
		margin-top: 12px;
		padding-left: 1.4rem;
		list-style: decimal;
	}
	.listed li {
		padding-block: 5px;
		padding-left: 4px;
		overflow-wrap: anywhere;
		line-height: 1.45;
	}
	.listed li::marker {
		font-family: var(--mono);
		font-size: 0.8125rem;
		color: var(--ink-3);
	}
	.listed .text {
		margin-left: 8px;
		white-space: nowrap;
	}
	@media (max-width: 560px) {
		.questions > li {
			grid-template-columns: 1.5rem minmax(0, 1fr);
		}
		.side {
			grid-column: 2;
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-top: 4px;
		}
	}
</style>
