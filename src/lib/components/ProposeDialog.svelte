<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import { connectHref, postJson } from '#lib/client.ts';
	import { countWords } from '#lib/prompt.ts';
	import { MAX_QUESTION_WORDS } from '#lib/round.ts';
	import Dialog from './Dialog.svelte';
	import GitHubMark from './GitHubMark.svelte';

	let {
		open = $bindable(false),
		slug,
		signedIn,
		draft = $bindable(''),
		onproposed
	}: {
		open?: boolean;
		slug: string;
		signedIn: boolean;
		draft?: string;
		onproposed: (id: number, question: string) => void;
	} = $props();

	const DRAFT = $derived(`openresearch.question.${slug}`);
	let busy = $state(false);
	let error = $state('');

	const words = $derived(countWords(draft));
	const over = $derived(words > MAX_QUESTION_WORDS);

	// The question is kept on this device while GitHub is connected, as a prompt is.
	$effect(() => {
		if (!open) return;
		try {
			if (!draft) draft = localStorage.getItem(DRAFT) ?? '';
		} catch {
			/* The draft is a convenience and can be lost safely. */
		}
	});

	function store() {
		error = '';
		try {
			if (draft) localStorage.setItem(DRAFT, draft);
			else localStorage.removeItem(DRAFT);
		} catch {
			/* See above. */
		}
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || words === 0 || over) return;
		busy = true;
		error = '';
		try {
			const { ok, data } = await postJson<{ id: number }>(`/api/projects/${slug}/proposals`, { question: draft });
			if (!ok) {
				error = data.message ?? 'The question could not be listed.';
				return;
			}
			const question = draft.split(/\s+/).filter(Boolean).join(' ');
			draft = '';
			store();
			await refreshAll();
			open = false;
			onproposed(data.id, question);
		} catch {
			error = 'The question could not be sent. The connection should be examined and the attempt repeated.';
		} finally {
			busy = false;
		}
	}
</script>

<Dialog bind:open title="Propose a question">
	<form onsubmit={submit} class="form">
		<p class="muted lead">
			The question is listed for the round at once, and anyone may pledge towards it. It costs nothing to propose.
		</p>
		<div>
			<label class="label" for="question">Question</label>
			<!-- svelte-ignore a11y_autofocus -->
			<textarea
				id="question"
				class="field serif"
				rows="4"
				placeholder="What should be researched next?"
				aria-describedby="question-count"
				aria-invalid={over}
				autofocus
				bind:value={draft}
				oninput={store}
			></textarea>
			<p id="question-count" class="count small figures" class:over aria-live={over ? 'polite' : 'off'}>
				{words} of {MAX_QUESTION_WORDS} words
			</p>
		</div>

		{#if over}
			<p class="error" role="alert">The question must be reduced by {words - MAX_QUESTION_WORDS} {words - MAX_QUESTION_WORDS === 1 ? 'word' : 'words'}.</p>
		{/if}
		{#if error}<p class="error" role="alert">{error}</p>{/if}

		{#if signedIn}
			<button class="btn btn-primary btn-wide" type="submit" disabled={busy || words === 0 || over}>
				{busy ? 'Listing the question' : 'Propose question'}
			</button>
		{:else}
			<a
				class="btn btn-primary btn-wide"
				href={connectHref(`${page.url.pathname}?propose=1`)}
				data-sveltekit-reload
				data-sveltekit-preload-data="false"
			>
				<GitHubMark /> Connect GitHub to propose
			</a>
			<p class="small muted">The question is kept on this device while the GitHub account is connected.</p>
		{/if}
	</form>
</Dialog>

<style>
	.form {
		display: grid;
		gap: 16px;
	}
	textarea {
		display: block;
		width: 100%;
		min-height: 6.5rem;
		padding-block: 10px;
		resize: vertical;
		font-size: 1.125rem;
		line-height: 1.4;
	}
	.count {
		margin-top: 6px;
		color: var(--ink-2);
	}
	.count.over {
		color: var(--warn);
		font-weight: 500;
	}
</style>
