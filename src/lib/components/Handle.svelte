<script lang="ts">
	import Avatar from './Avatar.svelte';

	let {
		handle,
		avatar = null,
		size = 20,
		link = true,
		strong = false
	}: { handle: string; avatar?: string | null; size?: number; link?: boolean; strong?: boolean } = $props();
</script>

<!-- An account is always shown by its @handle, in the same face, wherever it appears. -->
<svelte:element this={link ? 'a' : 'span'} class="handle" class:strong href={link ? `/u/${handle}` : undefined}>
	<Avatar src={avatar} {handle} {size} />
	<span class="at">@{handle}</span>
</svelte:element>

<style>
	.handle {
		position: relative;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		/* A tap target of at least 24 pixels, without changing the height of the line. */
		padding-block: 3px;
		margin-block: -3px;
		min-width: 0;
		max-width: 100%;
		font-family: var(--mono);
		font-size: 0.8125rem;
		font-weight: 500;
		line-height: 1.3;
		color: var(--ink);
	}
	.strong {
		font-size: 0.9375rem;
		gap: 9px;
	}
	.at {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	a.handle .at {
		text-decoration: underline;
		text-decoration-color: transparent;
		text-underline-offset: 0.2em;
		transition: text-decoration-color 0.15s ease;
	}
	@media (hover: hover) and (pointer: fine) {
		a.handle:hover .at {
			text-decoration-color: currentColor;
		}
	}
</style>
