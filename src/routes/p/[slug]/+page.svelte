<script lang="ts">
	import Countdown from '#lib/components/Countdown.svelte';
	import LiveRun from '#lib/components/LiveRun.svelte';
	import RoundPanel from '#lib/components/RoundPanel.svelte';
	import { money } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const project = $derived(data.project);
	const questions = $derived(JSON.parse(project.open_questions) as string[]);
</script>

<LiveRun slug={project.slug} prompt={project.prompt} queued={Boolean(project.active)} />

{#if data.round.closesAt && project.findings_html}
	<!-- With findings above it, the round is far down the page, so it is announced here. -->
	<p class="announce small">
		<span class="tag"><span class="dot" aria-hidden="true"></span>Round {data.round.round}</span>
		<span>
			<Countdown closesAt={data.round.closesAt} now={data.now} />, with {money(data.round.pledged)} pledged.
			<a class="link" href="#next">See the questions</a>
		</span>
	</p>
{/if}

{#if project.findings_html}
	<div class="prose">{@html project.findings_html}</div>

	<p class="formats small muted">
		The findings may be read as
		<a class="link" href="/p/{project.slug}/files/findings.md" data-sveltekit-reload>text</a> or as
		<a class="link" href="/p/{project.slug}/files/findings.html" data-sveltekit-reload>HTML</a>.
	</p>
{:else if !project.active && project.runs > 0}
	<div class="empty">
		<p class="serif">No findings have been reported so far.</p>
		<p class="muted">Further runs may be funded by a donation.</p>
	</div>
{:else if !project.active}
	<div class="empty">
		<p class="serif">No research has been funded as yet.</p>
		<p class="muted">The first run begins as soon as a donation is made.</p>
	</div>
{/if}

<RoundPanel
	slug={project.slug}
	round={data.round}
	now={data.now}
	signedIn={Boolean(data.user)}
	suggestions={project.findings_html ? questions : []}
/>

<style>
	.announce {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 12px;
		margin-bottom: 24px;
		padding: 10px 14px;
		border: 1px solid var(--rule);
		border-radius: 10px;
		background: var(--surface);
	}
	.formats {
		margin-top: 40px;
	}
	.empty p:first-child {
		font-size: 1.375rem;
		line-height: 1.3;
		margin-bottom: 6px;
	}
</style>
