<script lang="ts">
	import LiveRun from '#lib/components/LiveRun.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const project = $derived(data.project);
	const questions = $derived(JSON.parse(project.open_questions) as string[]);
</script>

<LiveRun slug={project.slug} prompt={project.prompt} queued={Boolean(project.active)} />

{#if project.findings_html}
	<div class="prose">{@html project.findings_html}</div>

	{#if questions.length}
		<section class="open">
			<h2 class="serif">Open questions</h2>
			<ol class="prose">
				{#each questions as question}
					<li>{question}</li>
				{/each}
			</ol>
		</section>
	{/if}

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

<style>
	.open {
		margin-top: 48px;
		padding-top: 28px;
		border-top: 1px solid var(--rule);
	}
	h2 {
		font-size: 1.375rem;
		margin-bottom: 14px;
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
