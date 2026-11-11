<script lang="ts">
	import { onMount } from 'svelte';
	import { refreshAll } from '$app/navigation';
	import { fade, slide } from 'svelte/transition';
	import { shortModelName } from '#lib/format.ts';

	type Phase = 'starting' | 'searching' | 'writing' | 'editing';
	type Live = { seq: number; phase: Phase; question: string; modelName: string; handle: string; text: string };

	let { slug, prompt, queued = false }: { slug: string; prompt: string; queued?: boolean } = $props();

	let live = $state<Live | null>(null);
	let settling: ReturnType<typeof setTimeout> | undefined;
	let rounding: ReturnType<typeof setTimeout> | undefined;

	const PHASES: Record<Phase, string> = {
		starting: 'The run is being started.',
		searching: 'The web is being searched.',
		writing: 'The report is being written.',
		editing: 'The findings are being updated.'
	};

	/** Streamed text is shown as plain paragraphs until the finished report replaces it. */
	type Block = { kind: 'h' | 'p'; text: string };
	const blocks = $derived.by<Block[]>(() => {
		if (!live?.text) return [];
		return live.text
			.split(/\n{2,}/)
			.map((raw) => raw.trim())
			.filter(Boolean)
			.map((raw) => {
				const heading = /^#{1,6}\s+/.test(raw);
				const text = raw
					.replace(/^#{1,6}\s+/, '')
					.replace(/^[-*]\s+/gm, '')
					.replace(/\[([^\]\n]{0,400})\]\([^)\n]{0,2000}\)?/g, '$1')
					.replace(/[*_`]{1,3}/g, '');
				return { kind: heading ? 'h' : 'p', text };
			});
	});

	onMount(() => {
		const source = new EventSource(`/p/${slug}/events`);
		source.onmessage = (message) => {
			const event = JSON.parse(message.data);
			if (event.type === 'run') {
				clearTimeout(settling);
				live = event.live;
			} else if (event.type === 'phase' && live) {
				live.phase = event.phase;
			} else if (event.type === 'delta' && live) {
				live.text += event.text;
			} else if (event.type === 'round') {
				// A question, a pledge or the settling of a round. The figures on the page are read again.
				clearTimeout(rounding);
				rounding = setTimeout(() => refreshAll(), 250);
			} else if (event.type === 'end') {
				// The block stays until the page has been updated. If another run follows at once,
				// it takes over the same space, so the page does not jump between runs.
				if (live) {
					refreshAll().then(() => {
						clearTimeout(settling);
						settling = setTimeout(() => (live = null), 700);
					});
				}
			}
		};
		return () => {
			clearTimeout(settling);
			clearTimeout(rounding);
			source.close();
		};
	});
</script>

{#if live}
	<section class="live" aria-label="Run in progress" transition:slide={{ duration: 240 }}>
		<header>
			<p class="status" aria-live="polite">
				<span class="dot" aria-hidden="true"></span>
				<span>Run {live.seq}. {PHASES[live.phase]}</span>
			</p>
			<p class="small muted">Funded by @{live.handle} with {shortModelName(live.modelName)}</p>
		</header>
		{#if live.question !== prompt}
			<h3 class="question serif">{live.question}</h3>
		{/if}
		{#if blocks.length}
			<div class="stream prose" class:fading={live.phase === 'editing'}>
				{#each blocks as block, i (i)}
					<svelte:element this={block.kind === 'h' ? 'h4' : 'p'} in:fade={{ duration: 200 }}>{block.text}</svelte:element>
				{/each}
			</div>
		{/if}
	</section>
{:else if queued}
	<p class="waiting small muted" role="status">
		<span class="dot" aria-hidden="true"></span> A donation is waiting to begin.
	</p>
{/if}

<style>
	.live {
		margin-bottom: 40px;
		padding-bottom: 32px;
		border-bottom: 1px solid var(--rule);
	}
	header {
		display: grid;
		gap: 2px;
	}
	.status {
		display: flex;
		align-items: center;
		gap: 9px;
		font-weight: 500;
		font-size: 0.9375rem;
	}
	.dot {
		flex: none;
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--ok);
		animation: breathe 2.4s ease-in-out infinite;
	}
	@keyframes breathe {
		50% {
			opacity: 0.35;
		}
	}
	.question {
		margin-top: 16px;
		font-size: 1.25rem;
		line-height: 1.3;
	}
	.stream {
		margin-top: 20px;
		transition: opacity 0.3s ease-out;
	}
	.stream.fading {
		opacity: 0.55;
	}
	.waiting {
		display: flex;
		align-items: center;
		gap: 9px;
		margin-bottom: 28px;
	}
</style>
