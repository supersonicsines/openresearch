<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head><title>{page.status === 404 ? 'Not found' : 'Error'} · OpenResearch</title></svelte:head>

<div class="error-page">
	<h1 class="serif">{page.status === 404 ? 'This page could not be found.' : 'This page could not be displayed.'}</h1>
	<p class="muted">{page.status === 404 ? 'It may have been moved, or the address may have been mistyped.' : (page.error?.message ?? 'An unexpected error occurred.')}</p>
	<a class="link" href="/">Return to the board</a>
</div>

<style>
	.error-page {
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
