<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Test sign-in · OpenResearch</title></svelte:head>

<div class="page">
	<h1 class="serif">Test sign-in</h1>
	<p class="muted">X has not been configured on this machine, so a handle may be entered in its place. This page is available only on this machine.</p>
	<form method="POST" use:enhance>
		<input type="hidden" name="next" value={data.next} />
		<label class="label" for="handle">Handle</label>
		<!-- svelte-ignore a11y_autofocus -->
		<input id="handle" class="field" name="handle" defaultValue={form?.handle ?? ''} autocomplete="off" autocapitalize="off" autocorrect="off" enterkeyhint="go" spellcheck="false" autofocus required />
		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		<button class="btn btn-primary" type="submit">Continue</button>
	</form>
</div>

<style>
	.page {
		max-width: 26rem;
		padding-top: 48px;
	}
	h1 {
		font-size: 2.25rem;
		line-height: 1.15;
		letter-spacing: -0.012em;
	}
	form {
		display: grid;
		gap: 10px;
		margin-top: 24px;
		justify-items: start;
	}
	.label {
		margin-bottom: 0;
	}
</style>
