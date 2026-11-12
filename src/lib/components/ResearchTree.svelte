<script lang="ts">
	import { fullDate, money, plural, shortModelName } from '#lib/format.ts';
	import { tally, treeAt, type Branch, type State, type TreeNode } from '#lib/lineage.ts';
	import Handle from './Handle.svelte';

	let { slug, nodes }: { slug: string; nodes: TreeNode[] } = $props();

	const base = $derived(`/p/${slug}`);
	const runs = $derived(
		nodes
			.filter((n) => n.run)
			.map((n) => n.run!)
			.sort((a, b) => a.seq - b.seq)
	);
	const last = $derived(runs.at(-1)?.seq ?? 0);

	/** The run after which the tree is shown. Null follows the present, so that a new run is taken up as it arrives. */
	let chosen = $state<number | null>(null);
	const at = $derived(chosen === null ? last : Math.min(chosen, last));
	const present = $derived(at === last);

	let only = $state<'all' | 'open'>('all');
	let folded = $state<Record<string, boolean>>({});
	/** The runs whose set-aside questions have been asked for. They are kept out of the way until then. */
	let unfolded = $state<Record<string, boolean>>({});

	const whole = $derived(treeAt(nodes, at));
	const counts = $derived(tally(whole));

	/** With only open questions wanted, a branch is kept where it holds one, so that the way to it is still shown. */
	function prune(list: Branch[]): Branch[] {
		return list
			.map((branch) => ({ ...branch, children: prune(branch.children) }))
			.filter((branch) => branch.state === 'open' || branch.state === 'proposed' || branch.children.length > 0);
	}
	const shown = $derived(only === 'open' ? prune(whole) : whole);

	const moment = $derived(runs.findLast((r) => r.seq <= at));
	const raised = $derived(runs.filter((r) => r.seq <= at).reduce((sum, r) => sum + r.costMicro, 0));

	const STATES: Record<State, string> = {
		researched: 'Researched',
		open: 'Open',
		proposed: 'In a round',
		aside: 'Set aside'
	};

	function origin(node: TreeNode): string {
		if (node.origin === 'prompt') return 'The prompt itself';
		if (node.origin === 'review') return 'A review of what had not been covered';
		if (node.origin === 'audit') return 'The standing audit of the findings';
		if (node.origin === 'proposal') return 'Proposed by a visitor';
		return node.parent > 0 ? `Listed by the editor after run ${node.parent}` : 'Listed by the editor';
	}

	const stats = $derived([
		{ value: counts.raised, label: counts.raised === 1 ? 'question raised' : 'questions raised' },
		{ value: counts.researched, label: 'researched' },
		{ value: counts.open + counts.proposed, label: 'open' },
		{ value: counts.aside, label: 'set aside' }
	]);
</script>

<section class="intro">
	<h2 class="serif">Research tree</h2>
	<p class="small muted how">
		Every question asked of this prompt, and where it came from. A question is the prompt itself, is listed by
		the editor after a run, or is proposed by a visitor. It hangs from the run that raised it.
	</p>
</section>

{#if nodes.length === 0}
	<div class="empty">
		<p class="serif">No question has been researched as yet.</p>
		<p class="muted">The first run researches the prompt itself, and the questions it raises are listed here.</p>
	</div>
{:else}
	<dl class="stats-strip" aria-label="The tree in figures">
		{#each stats as stat (stat.label)}
			<div><dd class="figures">{stat.value}</dd><dt>{stat.label}</dt></div>
		{/each}
	</dl>

	{#if last > 0}
		<div class="time">
			<label class="label" for="tree-at">The tree as it stood</label>
			<div class="scrub">
				<button class="step" type="button" aria-label="One run earlier" disabled={at === 0} onclick={() => (chosen = at - 1)}>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5" /></svg>
				</button>
				<input
					id="tree-at"
					type="range"
					min="0"
					max={last}
					step="1"
					value={at}
					aria-valuetext={at === 0 ? 'Before the first run' : `After run ${at} of ${last}`}
					oninput={(event) => {
						const value = Number(event.currentTarget.value);
						chosen = value >= last ? null : value;
					}}
				/>
				<button class="step" type="button" aria-label="One run later" disabled={present} onclick={() => (chosen = at + 1 >= last ? null : at + 1)}>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
				</button>
			</div>
			<p class="moment figures" role="status">
				{#if at === 0}
					Before the first run
				{:else}
					After run {at} of {last}{#if moment}, {fullDate(moment.at)}{/if}, {money(raised)} raised
				{/if}
			</p>
			{#if !present}
				<button class="text small" type="button" onclick={() => (chosen = null)}>Return to the present</button>
			{/if}
		</div>
	{/if}

	<div class="bar">
		<div class="filter" role="group" aria-label="Questions shown">
			<button type="button" aria-pressed={only === 'all'} onclick={() => (only = 'all')}>All questions</button>
			<button type="button" aria-pressed={only === 'open'} onclick={() => (only = 'open')}>Open only</button>
		</div>
		<ul class="legend small muted" aria-label="Key">
			<li><span class="mark researched" aria-hidden="true"></span>Researched</li>
			<li><span class="mark open" aria-hidden="true"></span>Open</li>
			<li><span class="mark proposed" aria-hidden="true"></span>In a round</li>
			<li><span class="mark aside" aria-hidden="true"></span>Set aside</li>
		</ul>
	</div>

	{#snippet one(branch: Branch)}
			{@const node = branch.node}
			{@const closed = Boolean(folded[node.id])}
			<li id={node.id} class="node {branch.state}" class:latest={!present && branch.state === 'researched' && node.run?.seq === at}>
				<div class="row">
					<span class="mark {branch.state}" aria-hidden="true"></span>
					<div class="body">
						<p class="head">
							{#if branch.state === 'researched' && node.run}
								<a class="ref run" href="{base}/runs/{node.run.seq}">Run {node.run.seq}</a>
							{:else}
								<span class="tag state {branch.state}">{STATES[branch.state]}</span>
							{/if}
							<span class="origin small muted">{origin(node)}</span>
						</p>
						<p class="serif asked">{node.origin === 'prompt' ? 'The prompt, as it was submitted.' : node.text}</p>

						{#if branch.state === 'researched' && node.run}
							<p class="found">{node.run.headline || 'No new findings were reported.'}</p>
							<p class="meta small muted">
								<span>{fullDate(node.run.at)}</span>
								<span>{shortModelName(node.run.modelName)}</span>
								<span class="figures">{money(node.run.costMicro)}</span>
								{#if node.run.sources}<span>{plural(node.run.sources, 'source')}</span>{/if}
								<span class="by">Funded by{' '}<Handle handle={node.run.handle} avatar={node.run.avatar} size={18} /></span>
								{#if node.proposer}<span class="by">Proposed by{' '}<Handle handle={node.proposer} size={18} /></span>{/if}
							</p>
						{:else if branch.state === 'proposed'}
							<p class="meta small muted">
								{#if node.proposer}<span class="by">Proposed by{' '}<Handle handle={node.proposer} size={18} /></span>{/if}
								{#if node.pledged > 0}
									<span><span class="figures">{money(node.pledged)}</span>{' '}pledged by {plural(node.backers, 'backer')}</span>
								{:else if node.proposalId !== null}
									<span>No pledges</span>
								{/if}
								{#if present && node.proposalId !== null}<a class="link" href="{base}?back={node.proposalId}">Back</a>{/if}
							</p>
						{:else if branch.state === 'aside'}
							<p class="meta small muted">
								<span>Taken off the list by the editor after run {node.closedSeq}</span>
								{#if present}<a class="link" href="{base}?propose=1&q={encodeURIComponent(node.text)}">Propose</a>{/if}
							</p>
						{:else if present}
							<p class="meta small muted">
								<span>Awaiting a donation or a pledge</span>
								<a class="link" href="{base}?propose=1&q={encodeURIComponent(node.text)}">Propose</a>
							</p>
						{/if}

						{#if branch.children.length}
							<button class="fold small" type="button" aria-expanded={!closed} onclick={() => (folded[node.id] = !closed)}>
								<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class:turned={!closed}><path d="M6 3.5 10.5 8 6 12.5" /></svg>
								<span>
									{plural(branch.below, 'question')} beneath{#if branch.runs > 1}, {money(branch.costMicro)} across {plural(branch.runs, 'run')}{/if}
								</span>
							</button>
						{/if}
					</div>
				</div>
				{#if branch.children.length && !closed}
					<ul>{@render branches(branch.children, node.id)}</ul>
				{/if}
			</li>
	{/snippet}

	<!-- An editor commonly rewrites its list after a run, so many questions are set aside. They are part of
	     the record, and are kept behind one line beneath each run so that the course of the research stays clear. -->
	{#snippet branches(list: Branch[], owner: string)}
		{@const aside = list.filter((branch) => branch.state === 'aside')}
		{#each list.filter((branch) => branch.state !== 'aside') as branch (branch.node.id)}
			{@render one(branch)}
		{/each}
		{#if aside.length}
			<li class="node group">
				<div class="row">
					<span class="mark aside" aria-hidden="true"></span>
					<div class="body">
						<button class="fold small" type="button" aria-expanded={Boolean(unfolded[owner])} onclick={() => (unfolded[owner] = !unfolded[owner])}>
							<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class:turned={Boolean(unfolded[owner])}><path d="M6 3.5 10.5 8 6 12.5" /></svg>
							<span>{plural(aside.length, 'question')} set aside by the editor</span>
						</button>
					</div>
				</div>
			</li>
			{#if unfolded[owner]}
				{#each aside as branch (branch.node.id)}
					{@render one(branch)}
				{/each}
			{/if}
		{/if}
	{/snippet}

	{#if shown.length}
		<ul class="tree" aria-label="Questions, each beneath the run that raised it">{@render branches(shown, 'top')}</ul>
	{:else if at === 0}
		<p class="muted none">Nothing had been asked before the first run.</p>
	{:else}
		<p class="muted none">No question is open at this point.</p>
	{/if}

	<p class="small muted note">
		A run's own page gives its report in full. The same record is kept in the repository: each commit names
		the run that raised its question, and <code>open-questions.md</code> holds the list as that run left it.
	</p>
{/if}

<style>
	h2 {
		font-size: 1.375rem;
	}
	.how {
		margin-top: 8px;
		max-width: 36rem;
	}
	.empty {
		margin-top: 28px;
	}
	.empty p:first-child {
		font-size: 1.375rem;
		line-height: 1.3;
		margin-bottom: 6px;
	}
	.stats-strip {
		margin-top: 22px;
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
	.time {
		display: grid;
		gap: 6px;
		margin-top: 24px;
	}
	.time .label {
		margin: 0;
	}
	.scrub {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.scrub input {
		flex: 1;
		min-width: 0;
		height: 32px;
		margin: 0;
		accent-color: var(--signal);
	}
	.step {
		display: grid;
		place-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		border: 1px solid var(--rule-2);
		border-radius: 8px;
		color: var(--ink);
	}
	.step:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.moment {
		font-size: 0.8125rem;
		letter-spacing: 0;
		color: var(--ink-2);
	}
	.text {
		justify-self: start;
		padding-block: 4px;
		margin-block: -2px;
		color: var(--ink-2);
		text-decoration: underline;
		text-decoration-color: var(--rule-2);
		text-underline-offset: 0.2em;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px 20px;
		margin-top: 22px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--rule);
	}
	.filter {
		display: inline-flex;
		border: 1px solid var(--rule-2);
		border-radius: 8px;
		overflow: hidden;
	}
	.filter button {
		min-height: 32px;
		padding: 0 12px;
		font-size: 0.875rem;
		color: var(--ink-2);
	}
	.filter button + button {
		border-left: 1px solid var(--rule-2);
	}
	.filter button[aria-pressed='true'] {
		background: var(--ink);
		color: var(--bg);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
	}
	.legend li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	/* The marks say how a question stands, and every one of them is also given in words. */
	.mark {
		flex: none;
		display: inline-block;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		border: 1.5px solid var(--ink);
		background: var(--ink);
	}
	.mark.open {
		border-color: var(--signal);
		background: transparent;
	}
	.mark.proposed {
		border-color: var(--signal);
		background: var(--signal);
	}
	.mark.aside {
		border: 1.5px dashed var(--ink-3);
		background: transparent;
	}

	.tree,
	.tree ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	/* A rule runs down from each run to the questions that it raised. */
	.tree ul {
		margin-left: 4px;
		padding-left: 20px;
		border-left: 1px solid var(--rule-2);
	}
	.node {
		position: relative;
		scroll-margin-top: 16px;
	}
	.tree ul > .node::before {
		content: '';
		position: absolute;
		left: -20px;
		top: 24px;
		width: 13px;
		border-top: 1px solid var(--rule-2);
	}
	.row {
		display: grid;
		grid-template-columns: 9px minmax(0, 1fr);
		gap: 12px;
		padding-block: 14px 12px;
	}
	.row > .mark {
		margin-top: 6px;
	}
	.body {
		display: grid;
		gap: 5px;
		min-width: 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px 12px;
	}
	.run {
		/* A tap target of at least 24 pixels, without changing the height of the line. */
		padding-block: 4px;
		margin-block: -4px;
		font-weight: 500;
		color: var(--ink);
		text-decoration: underline;
		text-decoration-color: var(--rule-2);
		text-underline-offset: 0.2em;
	}
	.state.aside {
		color: var(--ink-2);
	}
	.asked {
		overflow-wrap: anywhere;
		font-size: 1.0625rem;
		line-height: 1.36;
		text-wrap: pretty;
	}
	.aside .asked {
		color: var(--ink-2);
	}
	.found {
		overflow-wrap: anywhere;
		font-size: 0.9375rem;
		line-height: 1.45;
		padding-left: 12px;
		border-left: 2px solid var(--rule-2);
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
	.fold {
		justify-self: start;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding-block: 4px;
		margin-block: -2px;
		color: var(--ink-2);
		text-align: left;
	}
	.fold svg {
		flex: none;
		transition: transform 0.16s var(--ease-out);
	}
	.fold svg.turned {
		transform: rotate(90deg);
	}
	/* While the past is being looked at, the run at that point is marked, as is a question linked to. */
	.node.latest > .row,
	.node:target > .row {
		background: var(--surface);
		box-shadow: -10px 0 0 var(--surface), 10px 0 0 var(--surface);
		border-radius: 4px;
	}
	.group > .row {
		padding-block: 9px;
	}
	.group > .row > .mark {
		margin-top: 7px;
	}
	.none {
		margin-top: 22px;
	}
	.note {
		margin-top: 32px;
		max-width: 36rem;
	}
	code {
		font-family: var(--mono);
		font-size: 0.9em;
	}
	@media (max-width: 560px) {
		.stats-strip {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.tree ul {
			margin-left: 4px;
			padding-left: 13px;
		}
		.tree ul > .node::before {
			left: -13px;
			width: 8px;
		}
		.row {
			gap: 9px;
		}
	}
</style>
