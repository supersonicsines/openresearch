<script lang="ts">
	import { onMount } from 'svelte';
	import { timeLeft } from '#lib/round.ts';

	let {
		closesAt,
		now: initial,
		onclosed
	}: {
		closesAt: number;
		/** The server's time when the page was made, so that the first text agrees with what was sent. */
		now: number;
		onclosed?: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let now = $state(initial);
	const left = $derived(closesAt - now);

	onMount(() => {
		now = Date.now();
		let announced = false;
		const timer = setInterval(() => {
			now = Date.now();
			if (closesAt - now <= 0 && !announced) {
				announced = true;
				onclosed?.();
			}
		}, 1000);
		return () => clearInterval(timer);
	});
</script>

{#if left > 0}closes in {timeLeft(left)}{:else}is being settled{/if}
