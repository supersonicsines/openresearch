<script lang="ts">
	import { onMount } from 'svelte';
	import { refreshAll } from '$app/navigation';
	import ResearchTree from '#lib/components/ResearchTree.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The tree grows as it is watched: it is read again when a run finishes, and when a round changes.
	onMount(() => {
		const source = new EventSource(`/p/${data.project.slug}/events`);
		let timer: ReturnType<typeof setTimeout>;
		source.onmessage = (message) => {
			const type = JSON.parse(message.data).type;
			if (type !== 'end' && type !== 'round') return;
			clearTimeout(timer);
			timer = setTimeout(() => refreshAll(), 400);
		};
		return () => {
			clearTimeout(timer);
			source.close();
		};
	});
</script>

<svelte:head><title>Research tree · {data.project.title}</title></svelte:head>

<ResearchTree slug={data.project.slug} nodes={data.nodes} />
