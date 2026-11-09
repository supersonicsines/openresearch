<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title,
		wide = false,
		children
	}: { open?: boolean; title: string; wide?: boolean; children: Snippet } = $props();

	let el = $state<HTMLDialogElement>();
	/** The contents stay in place until the closing transition has finished. */
	let lingering = $state(false);
	let timer: ReturnType<typeof setTimeout>;

	$effect(() => {
		if (!el) return;
		if (open && !el.open) el.showModal();
		else if (!open && el.open) el.close();
	});

	$effect(() => {
		clearTimeout(timer);
		if (open) lingering = true;
		else timer = setTimeout(() => (lingering = false), 220);
		return () => clearTimeout(timer);
	});

	function onBackdrop(event: MouseEvent) {
		if (event.target === el) open = false;
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={el} class:wide onclose={() => (open = false)} onclick={onBackdrop} aria-label={title}>
	<div class="sheet">
		<header>
			<h2 class="serif">{title}</h2>
			<button class="close" type="button" onclick={() => (open = false)} aria-label="Close">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
					<path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
				</svg>
			</button>
		</header>
		{#if open || lingering}
			<div class="body">{@render children()}</div>
		{/if}
	</div>
</dialog>

<style>
	dialog {
		width: min(480px, calc(100vw - 32px));
		max-width: none;
		max-height: min(760px, calc(100dvh - 48px));
		padding: 0;
		margin: auto;
		border: 0;
		border-radius: 14px;
		background: var(--bg);
		color: var(--ink);
		box-shadow: var(--shadow);
		overflow: hidden;
		opacity: 0;
		transform: translateY(6px) scale(0.985);
		/* These apply while closing, which is quicker than opening. */
		transition:
			opacity 0.12s ease-out,
			transform 0.14s ease-out,
			overlay 0.14s allow-discrete,
			display 0.14s allow-discrete;
	}

	dialog.wide {
		width: min(640px, calc(100vw - 32px));
	}

	dialog[open] {
		opacity: 1;
		transform: none;
		display: flex;
		flex-direction: column;
		transition:
			opacity 0.16s ease-out,
			transform 0.24s var(--ease-out),
			overlay 0.24s allow-discrete,
			display 0.24s allow-discrete;
	}

	@starting-style {
		dialog[open] {
			opacity: 0;
			transform: translateY(6px) scale(0.985);
		}
	}

	dialog::backdrop {
		background: var(--scrim);
		opacity: 0;
		transition:
			opacity 0.14s ease-out,
			overlay 0.14s allow-discrete,
			display 0.14s allow-discrete;
	}

	dialog[open]::backdrop {
		opacity: 1;
	}

	@starting-style {
		dialog[open]::backdrop {
			opacity: 0;
		}
	}

	.sheet {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 18px 16px 0 24px;
		flex: none;
	}

	h2 {
		font-size: 1.375rem;
		line-height: 1.25;
	}

	.close {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 8px;
		color: var(--ink-2);
		transition: background-color 0.15s ease;
	}

	@media (hover: hover) and (pointer: fine) {
		.close:hover {
			background: var(--surface);
		}
	}

	.body {
		padding: 14px 24px calc(24px + env(safe-area-inset-bottom));
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	/* On a phone the dialog rises from the bottom edge, within reach of the thumb. */
	@media (max-width: 560px) {
		dialog,
		dialog.wide {
			width: 100%;
			max-height: calc(100dvh - 40px);
			margin: auto 0 0;
			border-radius: 16px 16px 0 0;
			transform: translateY(100%);
			opacity: 1;
			transition:
				transform 0.2s var(--ease-drawer),
				overlay 0.2s allow-discrete,
				display 0.2s allow-discrete;
		}
		dialog[open] {
			transform: none;
			transition:
				transform 0.34s var(--ease-drawer),
				overlay 0.34s allow-discrete,
				display 0.34s allow-discrete;
		}
		@starting-style {
			dialog[open] {
				opacity: 1;
				transform: translateY(100%);
			}
		}
		.body {
			padding-inline: 20px;
		}
		header {
			padding-left: 20px;
		}
	}
</style>
