<script lang="ts">
	import { timeAgo } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const base = $derived(`/p/${data.project.slug}`);
	const command = $derived(`git clone ${data.cloneUrl}`);
	const rootFiles = $derived(data.files.filter((f) => !f.startsWith('runs/')));
	const runFiles = $derived(data.files.filter((f) => f.startsWith('runs/')).reverse());

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout>;

	async function copy() {
		await navigator.clipboard.writeText(command);
		copied = true;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), 1600);
	}
</script>

<section>
	<div class="clone">
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<code tabindex="0">{command}</code>
		<button class="btn btn-quiet btn-small" type="button" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
	</div>
	<p class="small muted download">
		The repository may also be <a class="link" href="{base}/archive.zip" data-sveltekit-reload>downloaded as a zip file</a>.
	</p>
</section>

<section>
	<h2 class="serif">Files</h2>
	<ul class="files">
		{#each rootFiles as file (file)}
			<li><a href="{base}/files/{file}" data-sveltekit-reload>{file}</a></li>
		{/each}
	</ul>
	{#if runFiles.length}
		<details>
			<summary>{runFiles.length} files in runs/</summary>
			<ul class="files">
				{#each runFiles as file (file)}
					<li><a href="{base}/files/{file}" data-sveltekit-reload>{file}</a></li>
				{/each}
			</ul>
		</details>
	{/if}
</section>

<section>
	<h2 class="serif">History</h2>
	<ol class="log">
		{#each data.commits as commit (commit.sha)}
			<li>
				<span class="subject">{commit.subject}</span>
				<span class="small muted meta">
					<code>{commit.sha.slice(0, 7)}</code>
					<span class="who">{commit.author}</span>
					<span>{timeAgo(commit.date)}</span>
				</span>
			</li>
		{/each}
	</ol>
</section>

<style>
	section + section {
		margin-top: 40px;
	}
	h2 {
		font-size: 1.375rem;
		margin-bottom: 10px;
	}
	.clone {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 8px 8px 14px;
		background: var(--surface);
		border-radius: 8px;
	}
	code {
		font-family: var(--mono);
		font-size: 0.8125rem;
	}
	.clone code {
		min-width: 0;
		overflow-x: auto;
		white-space: nowrap;
		scrollbar-width: none;
	}
	.clone .btn {
		flex: none;
		background: var(--bg);
	}
	.download {
		margin-top: 10px;
	}
	.files {
		font-family: var(--mono);
		font-size: 0.875rem;
	}
	.files a {
		display: block;
		padding-block: 7px;
		border-bottom: 1px solid var(--rule);
		transition: color 0.15s ease;
	}
	@media (hover: hover) and (pointer: fine) {
		.files a:hover {
			color: var(--accent);
		}
	}
	details {
		margin-top: 2px;
	}
	summary {
		padding-block: 9px;
		font-size: 0.9375rem;
		color: var(--ink-2);
		cursor: pointer;
	}
	.log li {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 3px;
		padding-block: 11px;
	}
	.log li + li {
		border-top: 1px solid var(--rule);
	}
	.subject {
		overflow-wrap: anywhere;
		font-size: 0.9375rem;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0 12px;
	}
	.who {
		font-family: var(--mono);
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--ink);
	}
</style>
