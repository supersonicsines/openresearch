<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>Sign-in · OpenResearch</title></svelte:head>

<div class="page">
	{#if data.reason === 'expired'}
		<h1 class="serif">The sign-in request has expired.</h1>
		<p class="muted">The attempt should be repeated from the page that was being viewed.</p>
	{:else if data.reason === 'failed'}
		<h1 class="serif">The X account could not be connected.</h1>
		<p class="muted">X did not complete the request. The attempt may be repeated shortly.</p>
	{:else if data.reason === 'suspended'}
		<h1 class="serif">This account has been suspended.</h1>
		<p class="muted">Prompts and donations cannot be made from it. The operator of this site may be contacted about the decision.</p>
	{:else}
		<h1 class="serif">X sign-in has not been configured.</h1>
		<p class="muted">The values X_CLIENT_ID and X_CLIENT_SECRET must be added to the file named .env. The steps are given in docs/DEPLOY.md.</p>
	{/if}
	<a class="link" href="/">Return to the board</a>
</div>

<style>
	.page {
		display: grid;
		gap: 12px;
		padding-block: 72px;
		max-width: var(--measure);
		justify-items: start;
	}
	h1 {
		font-size: 2rem;
		line-height: 1.2;
	}
</style>
