<script lang="ts">
	let {
		src = null,
		handle,
		size = 28
	}: { src?: string | null; handle: string; size?: number } = $props();

	let failed = $state(false);
	const trusted = $derived(Boolean(src) && /^https:\/\/avatars\.githubusercontent\.com\//.test(src ?? ''));
</script>

{#if trusted && !failed}
	<img
		class="avatar"
		src={src ?? ''}
		alt=""
		width={size}
		height={size}
		loading="lazy"
		referrerpolicy="no-referrer"
		style:--size="{size}px"
		onerror={() => (failed = true)}
	/>
{:else}
	<span class="avatar blank" style:--size="{size}px" aria-hidden="true">
		{handle.slice(0, 1).toUpperCase()}
	</span>
{/if}

<style>
	.avatar {
		display: block;
		flex: none;
		width: var(--size);
		height: var(--size);
		border-radius: 50%;
		object-fit: cover;
		background: var(--surface);
		outline: 1px solid color-mix(in srgb, var(--ink) 8%, transparent);
		outline-offset: -1px;
	}
	.blank {
		display: grid;
		place-items: center;
		font-family: var(--serif);
		font-size: calc(var(--size) * 0.46);
		line-height: 1;
		color: var(--ink-2);
		user-select: none;
	}
</style>
