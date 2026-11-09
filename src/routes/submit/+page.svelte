<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { connectHref } from '#lib/client.ts';
	import GitHubMark from '#lib/components/GitHubMark.svelte';
	import { countWords, MAX_WORDS } from '#lib/prompt.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const DRAFT = 'openresearch.draft';
	let prompt = $state('');
	let busy = $state(false);
	let box = $state<HTMLTextAreaElement>();

	const words = $derived(countWords(prompt));
	const over = $derived(words > MAX_WORDS);

	function storeDraft() {
		try {
			if (prompt) localStorage.setItem(DRAFT, prompt);
			else localStorage.removeItem(DRAFT);
		} catch {
			/* The draft is a convenience and can be lost safely. */
		}
	}

	onMount(() => {
		if (form?.prompt) {
			prompt = form.prompt;
		} else if (!prompt) {
			// On a slow connection, someone may have begun typing before this ran. That text is kept.
			try {
				prompt = localStorage.getItem(DRAFT) ?? '';
			} catch {
				prompt = '';
			}
		}
		box?.focus();
	});
</script>

<svelte:head><title>Submit a prompt · OpenResearch</title></svelte:head>

<div class="page">
	<h1 class="serif">Submit a prompt</h1>
	<p class="muted lede">A public repository is created for each prompt. Prompts cannot be changed once they have been submitted.</p>

	<form
		method="POST"
		use:enhance={() => {
			busy = true;
			return async ({ update, result }) => {
				if (result.type === 'redirect') {
					try {
						localStorage.removeItem(DRAFT);
					} catch {
						/* See above. */
					}
				}
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		<label class="sr" for="prompt">Prompt</label>
		<textarea
			id="prompt"
			name="prompt"
			class="serif"
			bind:this={box}
			bind:value={prompt}
			oninput={storeDraft}
			rows="9"
			placeholder="What should be researched?"
			aria-describedby="count"
			aria-invalid={over}
		></textarea>

		<div class="foot">
			<p id="count" class="count small figures" class:over aria-live={over ? 'polite' : 'off'}>
				{words} of {MAX_WORDS} words
			</p>
			{#if data.user}
				<button class="btn btn-primary" type="submit" disabled={busy || words === 0 || over}>
					{busy ? 'Creating the repository' : 'Submit prompt'}
				</button>
			{:else}
				<a class="btn btn-primary" href={connectHref('/submit')} data-sveltekit-reload data-sveltekit-preload-data="false">
					<GitHubMark size={13} /> Connect GitHub to submit
				</a>
			{/if}
		</div>

		{#if form?.message}<p class="error message" role="alert">{form.message}</p>{/if}
		{#if over}<p class="error message" role="alert">The prompt must be reduced by {words - MAX_WORDS} {words - MAX_WORDS === 1 ? 'word' : 'words'}.</p>{/if}
		{#if !data.user}<p class="small muted message">The prompt is kept on this device while the GitHub account is connected.</p>{/if}
	</form>
</div>

<style>
	.page {
		max-width: var(--measure);
		padding-top: 48px;
	}
	h1 {
		font-size: clamp(2rem, 1.6rem + 1.6vw, 2.75rem);
		line-height: 1.15;
		letter-spacing: -0.014em;
	}
	.lede {
		margin-top: 12px;
		font-size: 1.0625rem;
	}
	form {
		margin-top: 28px;
	}
	textarea {
		display: block;
		width: 100%;
		min-height: 15rem;
		padding: 16px 18px;
		font-size: 1.25rem;
		line-height: 1.5;
		background: var(--bg);
		border: 1px solid var(--rule-2);
		border-radius: 10px;
		resize: vertical;
		field-sizing: content;
		max-height: 70dvh;
	}
	textarea::placeholder {
		color: var(--ink-3);
	}
	textarea:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -1px;
		border-color: transparent;
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-top: 12px;
	}
	.count {
		color: var(--ink-2);
		font-size: 0.9375rem;
		transition: color 0.15s ease;
	}
	.count.over {
		color: var(--warn);
		font-weight: 600;
	}
	.message {
		margin-top: 12px;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	@media (prefers-color-scheme: dark) {
		.count.over {
			color: #ef9a91;
		}
	}
	@media (max-width: 560px) {
		.page {
			padding-top: 24px;
		}
	}
</style>
