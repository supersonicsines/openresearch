<script lang="ts">
	import Dialog from './Dialog.svelte';
	import XMark from './XMark.svelte';

	let {
		open = $bindable(false),
		title = 'Share',
		cardUrl,
		shareUrl,
		postText,
		fileName
	}: {
		open?: boolean;
		title?: string;
		cardUrl: string;
		shareUrl: string;
		postText: string;
		fileName: string;
	} = $props();

	let loaded = $state(false);
	let failed = $state(false);
	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout>;

	const intent = $derived(
		`https://x.com/intent/tweet?text=${encodeURIComponent(postText)}&url=${encodeURIComponent(shareUrl)}`
	);

	async function copy() {
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			clearTimeout(timer);
			timer = setTimeout(() => (copied = false), 1600);
		} catch {
			copied = false;
		}
	}
</script>

<Dialog bind:open {title} wide>
	<figure class="card" class:loaded>
		{#if failed}
			<p class="small muted problem">The card could not be generated.</p>
		{:else}
			<img src={cardUrl} alt="The card to be shared" width="1200" height="630" onload={() => (loaded = true)} onerror={() => (failed = true)} />
		{/if}
	</figure>
	<p class="note small muted">The card is shown automatically when the link is posted on X.</p>
	<div class="actions">
		<a class="btn btn-primary" href={intent} target="_blank" rel="noopener noreferrer">
			<XMark /> Post on X
		</a>
		<a class="btn btn-quiet" href={cardUrl} download={fileName}>Download image</a>
		<button class="btn btn-quiet copy" type="button" onclick={copy}>
			<span class="swap" class:on={copied}>
				<span>Copy link</span>
				<span aria-hidden={!copied}>Copied</span>
			</span>
		</button>
	</div>
	<span class="sr" role="status">{copied ? 'The link has been copied.' : ''}</span>
</Dialog>

<style>
	.card {
		overflow: hidden;
		aspect-ratio: 1200 / 630;
		border-radius: 10px;
		background: var(--surface);
		outline: 1px solid var(--rule);
		outline-offset: -1px;
	}
	img {
		width: 100%;
		height: 100%;
		opacity: 0;
		transition: opacity 0.25s ease-out;
	}
	.loaded img {
		opacity: 1;
	}
	.problem {
		display: grid;
		place-items: center;
		height: 100%;
	}
	.note {
		margin-top: 10px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 14px;
	}
	.swap {
		display: inline-grid;
		text-align: center;
	}
	.swap > span {
		grid-area: 1 / 1;
		transition:
			opacity 0.16s ease-out,
			transform 0.2s var(--ease-out);
	}
	.swap > span:last-child {
		opacity: 0;
		transform: translateY(5px);
	}
	.swap.on > span:first-child {
		opacity: 0;
		transform: translateY(-5px);
	}
	.swap.on > span:last-child {
		opacity: 1;
		transform: none;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	@media (max-width: 560px) {
		.actions .btn {
			flex: 1 1 auto;
		}
		.actions .btn-primary {
			flex-basis: 100%;
		}
	}
</style>
