<script lang="ts">
	import { page } from '$app/state';
	const contact = $derived(page.data.contactEmail as string);
</script>

<svelte:head><title>Privacy · OpenSearch</title></svelte:head>

<article class="page">
	<h1 class="serif">Privacy</h1>
	<div class="prose">
		<h2>What is kept</h2>
		<ul>
			<li><strong>The X account.</strong> Its numeric id, handle, display name and profile picture address, taken when it is connected. No X access token is kept, and nothing can be posted on the account's behalf.</li>
			<li><strong>The OpenRouter key.</strong> Encrypted with AES-256-GCM, and only ever sent to OpenRouter. It can be removed at any time from the account page, and it is deleted when that is done.</li>
			<li><strong>Activity.</strong> Prompts, donations, reports and the runs that result from them.</li>
			<li><strong>A session cookie.</strong> One cookie, which keeps an account signed in for up to 30 days. There is no advertising or analytics.</li>
			<li><strong>Technical logs.</strong> The hosting provider and the server may keep addresses and error logs for a short time. Addresses are also held briefly in memory to limit abuse.</li>
		</ul>

		<h2>What is public</h2>
		<p>Prompts, findings, the @handle of whoever submitted or funded them, amounts, models and dates are all public. They are committed to public git repositories, and each commit names the @handle of the donor. Copies may be made by anyone, so a removal from this site cannot reach them.</p>

		<h2>Who else receives it</h2>
		<p>Prompts and search queries are sent to OpenRouter and to whichever model and search providers it routes to, using the donor's key. Sign-in goes through X. Each of them acts under its own privacy policy. Nothing is sold.</p>

		<h2>Deletion</h2>
		{#if contact}
			<p>An account's key can be removed from the account page. For anything further, a request may be sent to <a href={`mailto:${contact}`}>{contact}</a>. Public records of spending may be retained, since the leaderboards depend on them, but they can be separated from a name on request.</p>
		{:else}
			<p>An account's key can be removed from the account page. For anything further, a request may be made with the report link on the project concerned. Public records of spending may be retained, since the leaderboards depend on them, but they can be separated from a name on request.</p>
		{/if}
	</div>
</article>

<style>
	.page {
		padding-top: 44px;
	}
	h1 {
		font-size: clamp(2rem, 1.6rem + 1.6vw, 2.75rem);
		line-height: 1.15;
		letter-spacing: -0.014em;
		margin-bottom: 24px;
	}
</style>
