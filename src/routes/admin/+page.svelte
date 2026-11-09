<script lang="ts">
	import { enhance } from '$app/forms';
	import { money, reference, timeAgo } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Admin · OpenSearch</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<h1 class="serif">Admin</h1>
	<p class="muted">{money(data.totals.spent)} raised across {data.totals.runs} runs, with {data.totals.live} in progress.</p>
	{#if form?.message}<p class="done" role="status">{form.message}</p>{/if}

	<section>
		<h2 class="serif">Open reports</h2>
		{#if data.reports.length === 0}
			<p class="muted">No reports are open.</p>
		{:else}
			<ul class="rows">
				{#each data.reports as report (report.id)}
					<li>
						<p class="reason">{report.reason}</p>
						<p class="small muted">
							On <a class="link" href="/p/{report.slug}">{report.title}</a>, by @{report.author_handle}.
							Reported {timeAgo(report.created_at)}{report.reporter ? ` by @${report.reporter}` : ' anonymously'}.
						</p>
						<div class="actions">
							<form method="POST" action="?/hide" use:enhance>
								<input type="hidden" name="slug" value={report.slug} />
								<input type="hidden" name="reason" value="Removed following a report." />
								<button class="btn btn-danger btn-small" type="submit">Remove the project</button>
							</form>
							<form method="POST" action="?/resolve" use:enhance>
								<input type="hidden" name="id" value={report.id} />
								<button class="btn btn-quiet btn-small" type="submit">Close the report</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h2 class="serif">Prompts</h2>
		<ul class="rows">
			{#each data.projects as project (project.id)}
				<li class:gone={project.hidden_at}>
					<p>
						<span class="ref">{reference(project.id)}</span>
						{#if project.hidden_at}<span class="title serif">{project.title}</span>{:else}<a class="title serif link" href="/p/{project.slug}">{project.title}</a>{/if}
					</p>
					<p class="small muted">
						@{project.author_handle}{project.author_suspended ? ' (suspended)' : ''}, {timeAgo(project.created_at)}.
						{#if project.hidden_at}Removed: {project.hidden_reason}{/if}
					</p>
					<div class="actions">
						{#if project.hidden_at}
							<form method="POST" action="?/restore" use:enhance>
								<input type="hidden" name="slug" value={project.slug} />
								<button class="btn btn-quiet btn-small" type="submit">Restore</button>
							</form>
						{:else}
							<form method="POST" action="?/hide" use:enhance>
								<input type="hidden" name="slug" value={project.slug} />
								<button class="btn btn-danger btn-small" type="submit">Remove</button>
							</form>
						{/if}
						<form method="POST" action="?/purge" class="purge" use:enhance>
							<input type="hidden" name="slug" value={project.slug} />
							<label class="small"><input type="checkbox" name="confirm" required /> Permanently</label>
							<button class="btn btn-danger btn-small" type="submit">Delete text and repository</button>
						</form>
						{#if project.author_suspended}
							<form method="POST" action="?/unsuspend" use:enhance>
								<input type="hidden" name="handle" value={project.author_handle} />
								<button class="btn btn-quiet btn-small" type="submit">Restore @{project.author_handle}</button>
							</form>
						{:else}
							<form method="POST" action="?/suspend" class="purge" use:enhance>
								<input type="hidden" name="handle" value={project.author_handle} />
								<label class="small"><input type="checkbox" name="hidePrompts" /> And remove their prompts</label>
								<button class="btn btn-danger btn-small" type="submit">Suspend @{project.author_handle}</button>
							</form>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	</section>
</div>

<style>
	.page {
		padding-top: 36px;
		max-width: 52rem;
	}
	h1 {
		font-size: 2rem;
		line-height: 1.15;
	}
	h2 {
		font-size: 1.375rem;
		margin-bottom: 8px;
	}
	section {
		margin-top: 36px;
	}
	.done {
		margin-top: 14px;
		padding: 10px 14px;
		background: var(--surface);
		border-radius: 8px;
	}
	.rows li {
		display: grid;
		gap: 4px;
		padding-block: 14px;
	}
	.rows li + li {
		border-top: 1px solid var(--rule);
	}
	.gone .title {
		color: var(--ink-2);
	}
	.reason {
		white-space: pre-line;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		margin-top: 6px;
	}
	.purge {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.purge :global(.btn),
	.actions :global(.btn) {
		white-space: normal;
		text-align: left;
		height: auto;
		padding-block: 6px;
	}
	.rows li {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.purge label {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: var(--ink-2);
	}
</style>
