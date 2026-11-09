<script lang="ts">
	import '@fontsource-variable/source-serif-4/opsz.css';
	import '@fontsource-variable/source-serif-4/opsz-italic.css';
	import '@fontsource-variable/hanken-grotesk/wght.css';
	import '@fontsource/ibm-plex-mono/latin-400.css';
	import '@fontsource/ibm-plex-mono/latin-500.css';
	import '../app.css';
	import { onMount, tick } from 'svelte';
	import { beforeNavigate, onNavigate, refreshAll } from '$app/navigation';
	import { page, updated } from '$app/state';
	import { connectHref } from '#lib/client.ts';
	import { captureFlip } from '#lib/flip.ts';
	import Handle from '#lib/components/Handle.svelte';
	import Ticker from '#lib/components/Ticker.svelte';
	import XMark from '#lib/components/XMark.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const path = $derived(page.url.pathname);
	const nav = [
		{ href: '/', label: 'Board', current: (p: string) => p === '/' },
		{ href: '/prompts', label: 'All prompts', current: (p: string) => p.startsWith('/prompts') || p.startsWith('/p/') },
		{ href: '/leaderboards', label: 'Leaderboards', current: (p: string) => p.startsWith('/leaderboards') },
		{ href: '/about', label: 'About', current: (p: string) => p.startsWith('/about') }
	];

	/** Pages that list projects are brought up to date as things happen, without being reloaded. */
	const LIVE_PAGES = new Set(['/', '/prompts', '/leaderboards']);

	let feed = $state<typeof data.activity | null>(null);
	const items = $derived(feed ?? data.activity);

	onMount(() => {
		let version = data.activity[0]?.key ?? '';
		let stopped = false;
		let timer: ReturnType<typeof setTimeout>;

		async function poll() {
			// A tab that is not being looked at asks for nothing.
			if (document.visibilityState === 'visible') {
				try {
					const res = await fetch('/api/activity');
					if (res.ok) {
						const next = await res.json();
						// Replaced every time, so that the ages shown beside each item stay correct.
						feed = next.items;
						if (next.version !== version) {
							version = next.version;
							if (LIVE_PAGES.has(location.pathname)) {
								const play = captureFlip();
								await refreshAll();
								await tick();
								play();
							}
						}
					}
				} catch {
					/* The next attempt may succeed. */
				}
			}
			if (!stopped) timer = setTimeout(poll, 8_000);
		}
		timer = setTimeout(poll, 8_000);
		return () => {
			stopped = true;
			clearTimeout(timer);
		};
	});

	// A new release has gone live, so this navigation loads it in full rather than staying on old code.
	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url) location.href = to.url.href;
	});

	// The board slides when its sort changes, and the whole page fades when the page changes.
	onNavigate((navigation) => {
		if (navigation.from?.route.id === navigation.to?.route.id) return captureFlip();
		if (!document.startViewTransition) return;
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
	<title>OpenResearch</title>
	{#if !path.startsWith('/p/') && !path.startsWith('/u/')}
		<meta name="description" content="Any prompt may be listed. Those that are funded are researched in public, with every run committed to an open repository." />
		<meta property="og:type" content="website" />
		<meta property="og:title" content="OpenResearch" />
		<meta property="og:description" content="Any prompt may be listed. Those that are funded are researched in public." />
		<meta property="og:image" content="{page.url.origin}/card/site.png" />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content="OpenResearch" />
		<meta name="twitter:description" content="Any prompt may be listed. Those that are funded are researched in public." />
		<meta name="twitter:image" content="{page.url.origin}/card/site.png" />
	{/if}
</svelte:head>

<a class="skip" href="#main">Skip to content</a>

{#if data.demo}
	<p class="demo">Demonstration mode. Sign-in and responses are simulated.</p>
{/if}

<header class="site wrap">
	<a class="mark serif" href="/">OpenResearch</a>
	<nav aria-label="Main">
		{#each nav as item (item.href)}
			<a href={item.href} aria-current={item.current(path) ? 'page' : undefined}>{item.label}</a>
		{/each}
		{#if data.admin}
			<a href="/admin" aria-current={path.startsWith('/admin') ? 'page' : undefined}>Admin</a>
		{/if}
	</nav>
	<div class="end">
		<a class="btn btn-quiet btn-small submit" href="/submit"><span>Submit{' '}<span class="wide">a prompt</span></span></a>
		{#if data.user}
			<a class="account" href="/account" aria-current={path.startsWith('/account') ? 'page' : undefined}>
				<span class="sr">Account:{' '}</span>
				<Handle handle={data.user.handle} avatar={data.user.avatar_url} size={24} link={false} />
			</a>
		{:else}
			<a class="btn btn-primary btn-small" href={connectHref(path === '/' ? '/' : path + page.url.search)} data-sveltekit-reload data-sveltekit-preload-data="false">
				<XMark size={13} /> Connect X
			</a>
		{/if}
	</div>
</header>

<Ticker {items} />

<main id="main" class="wrap">
	{@render children()}
</main>

<footer class="site-foot wrap">
	<p>Findings are generated by AI models and have not been independently reviewed.</p>
	<nav aria-label="Site information">
		<a href="/about">About</a>
		<a href="/terms">Terms</a>
		<a href="/privacy">Privacy</a>
	</nav>
</footer>

<style>
	.demo {
		padding: 7px var(--gutter);
		background: var(--surface);
		border-bottom: 1px solid var(--rule);
		font-size: 0.8125rem;
		line-height: 1.4;
		color: var(--ink-2);
		text-align: center;
	}
	.site {
		display: flex;
		align-items: center;
		gap: 32px;
		padding-block: 16px;
		padding-top: max(16px, env(safe-area-inset-top));
	}
	.mark {
		padding-block: 6px;
		font-size: 1.3125rem;
		font-weight: 500;
		letter-spacing: -0.01em;
		line-height: 1;
	}
	nav {
		display: flex;
		gap: 20px;
		font-size: 0.9375rem;
	}
	nav a {
		white-space: nowrap;
		color: var(--ink-2);
		padding-block: 6px;
		transition: color 0.15s ease;
	}
	nav a[aria-current='page'] {
		color: var(--ink);
	}
	@media (hover: hover) and (pointer: fine) {
		nav a:hover {
			color: var(--ink);
		}
	}
	.end {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-left: auto;
	}
	.account {
		display: inline-flex;
		align-items: center;
		min-width: 0;
		min-height: 34px;
		max-width: 200px;
		padding: 0 11px 0 5px;
		border: 1px solid var(--rule-2);
		border-radius: 999px;
		transition:
			background-color 0.15s ease,
			transform 0.12s var(--ease-out);
	}
	.account:active {
		transform: scale(0.97);
	}
	@media (hover: hover) and (pointer: fine) {
		.account:hover {
			background: var(--surface);
		}
	}
	main {
		min-height: 60dvh;
	}
	.site-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px 32px;
		margin-top: 96px;
		padding-block: 28px calc(28px + env(safe-area-inset-bottom));
		font-size: 0.875rem;
		color: var(--ink-2);
	}
	.site-foot nav {
		gap: 16px;
		font-size: inherit;
	}
	.site-foot nav a {
		padding-block: 3px;
	}
	@media (max-width: 920px) {
		.site {
			flex-wrap: wrap;
			gap: 8px 16px;
		}
		nav {
			order: 3;
			width: 100%;
			gap: 14px;
			font-size: 0.875rem;
			overflow-x: auto;
			scrollbar-width: none;
		}
		nav::-webkit-scrollbar {
			display: none;
		}
		.site-foot nav {
			width: auto;
		}
		.wide {
			display: none;
		}
		.end {
			gap: 6px;
		}
		.site-foot {
			margin-top: 64px;
		}
	}
</style>
