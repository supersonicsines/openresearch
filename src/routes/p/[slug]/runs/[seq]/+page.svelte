<script lang="ts">
	import { fullDate, money, shortModelName } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const run = $derived(data.run);
	const base = $derived(`/p/${data.project.slug}`);
	const file = $derived(String(run.seq).padStart(4, '0'));
</script>

<svelte:head><title>Run {run.seq} · {data.project.title}</title></svelte:head>

<a class="link back small muted" href="{base}/runs">All runs</a>

<h2 class="serif question">{run.question}</h2>

<dl class="facts small">
	<div><dt>Run</dt><dd class="figures">{run.seq}</dd></div>
	{#if run.proposer}<div><dt>Proposed by</dt><dd><a class="link" href="/u/{run.proposer}">@{run.proposer}</a></dd></div>{/if}
	<div><dt>Funded by</dt><dd><a class="link" href="/u/{run.handle}">@{run.handle}</a></dd></div>
	<div><dt>Model</dt><dd>{shortModelName(run.model_name)}</dd></div>
	<div><dt>Tokens</dt><dd class="figures">{run.input_tokens.toLocaleString('en-GB')} in, {run.output_tokens.toLocaleString('en-GB')} out</dd></div>
	<div><dt>Cost</dt><dd class="figures">{money(run.cost_micro)}</dd></div>
	<div><dt>Completed</dt><dd>{fullDate(run.finished_at)}</dd></div>
</dl>

<div class="prose">{@html run.report_html}</div>

<p class="formats small muted">
	This run may be read as
	<a class="link" href="{base}/files/runs/{file}.md" data-sveltekit-reload>text</a> or as
	<a class="link" href="{base}/files/runs/{file}.html" data-sveltekit-reload>HTML</a>.
	{#if run.commit_sha}Commit <code>{run.commit_sha.slice(0, 10)}</code>.{/if}
</p>

<style>
	.back {
		display: inline-block;
		padding-block: 3px;
		margin-bottom: 18px;
	}
	.question {
		overflow-wrap: anywhere;
		font-size: 1.625rem;
		line-height: 1.22;
		letter-spacing: -0.008em;
		text-wrap: pretty;
	}
	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 12px 28px;
		margin-block: 18px 32px;
		padding-block: 14px;
		border-block: 1px solid var(--rule);
	}
	dt {
		color: var(--ink-2);
	}
	.formats {
		margin-top: 40px;
	}
	code {
		font-family: var(--mono);
		font-size: 0.9em;
	}
</style>
