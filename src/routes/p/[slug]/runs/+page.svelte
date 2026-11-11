<script lang="ts">
	import { money, shortModelName, timeAgo } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

{#if data.runs.length === 0}
	<p class="muted">No runs have been completed as yet.</p>
{:else}
	<ol>
		{#each data.runs as run (run.seq)}
			<li>
				<a href="/p/{data.project.slug}/runs/{run.seq}">
					<span class="seq figures">{run.seq}</span>
					<span class="what">
						<span class="question serif">{run.question}</span>
						<span class="meta small muted">
							<span class="who">@{run.handle}</span>
							{#if run.proposer}<span>proposed by <span class="who">@{run.proposer}</span></span>{/if}
							<span>{shortModelName(run.model_name)}</span>
							<span>{timeAgo(run.finished_at)}</span>
						</span>
					</span>
					<span class="cost figures">{money(run.cost_micro)}</span>
				</a>
			</li>
		{/each}
	</ol>
{/if}

<style>
	li + li {
		border-top: 1px solid var(--rule);
	}
	li:first-child a {
		padding-top: 0;
	}
	a {
		display: grid;
		grid-template-columns: 2.25rem minmax(0, 1fr) auto;
		gap: 8px;
		align-items: baseline;
		padding-block: 16px;
	}
	.seq {
		color: var(--ink-3);
		font-size: 1.0625rem;
	}
	.what {
		display: grid;
		gap: 5px;
	}
	.question {
		overflow-wrap: anywhere;
		font-size: 1.125rem;
		line-height: 1.32;
		text-wrap: pretty;
		transition: color 0.15s ease;
	}
	@media (hover: hover) and (pointer: fine) {
		a:hover .question {
			color: var(--accent);
		}
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0 14px;
	}
	.who {
		font-family: var(--mono);
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--ink);
	}
	.cost {
		padding-left: 20px;
		font-size: 1.0625rem;
	}
</style>
