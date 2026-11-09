<script lang="ts">
	import { onMount } from 'svelte';

	let host = $state<HTMLElement>();
	let ready = $state(false);

	onMount(() => {
		if (!host) return;
		const element = host;
		const scheme = matchMedia('(prefers-color-scheme: dark)');
		const theme = () => (scheme.matches ? 'dark' : 'light') as 'dark' | 'light';
		let demo: { setTheme(next: 'dark' | 'light'): void; destroy(): void } | undefined;
		let gone = false;

		const observer = new IntersectionObserver(
			async ([entry]) => {
				if (!entry.isIntersecting) return;
				observer.disconnect();
				const { mount } = await import('#lib/stage/mount.tsx');
				if (gone) return;
				demo = mount(element, theme());
				ready = true;
			},
			{ rootMargin: '300px' }
		);
		observer.observe(element);

		const changed = () => demo?.setTheme(theme());
		scheme.addEventListener('change', changed);
		return () => {
			gone = true;
			observer.disconnect();
			scheme.removeEventListener('change', changed);
			demo?.destroy();
		};
	});
</script>

<figure
	class="demo"
	class:ready
	role="img"
	aria-label="An illustration of the site in use. A donation of five dollars is made to a project, a research run is written, its finding is added to the findings, the amount raised rises, and the donor moves up the leaderboard."
>
	<div class="stage" bind:this={host} aria-hidden="true" inert></div>
</figure>

<style>
	.demo {
		margin-inline: -4px;
		aspect-ratio: 358 / 580;
		opacity: 0;
		transition: opacity 0.3s ease-out;
	}
	.demo.ready {
		opacity: 1;
	}
	/* The stage's own gutter is taken back, so that the window lines up with the page's text. */
	@media (min-width: 680px) {
		.demo {
			margin-inline: 0;
			max-width: 960px;
			aspect-ratio: 960 / 530;
		}
	}
	@media (min-width: 1040px) {
		.demo {
			margin-left: -24px;
		}
	}
	.stage {
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
</style>
