<script lang="ts">
	import { milestone, money, wholeMoney } from '#lib/format.ts';

	let {
		spent,
		pending = 0,
		delay = 0,
		against
	}: {
		spent: number;
		pending?: number;
		delay?: number;
		/** Measured against this amount instead of the next milestone. */
		against?: number;
	} = $props();

	const target = $derived(against ?? milestone(spent));
	const filled = $derived(target > 0 ? Math.min(spent / target, 1) : 0);
	const pledged = $derived(Math.min(pending / target, 1 - filled));
</script>

<!-- Twenty segments, so the fill can be read without the figure. -->
<div class="meter" role="img" aria-label={against !== undefined ? `${money(spent)}, against ${money(target)} for first place` : `${money(spent)} of the ${wholeMoney(target)} milestone${pending ? `, with ${money(pending)} pledged` : ''}`}>
	<div class="track">
		<span class="pledged" style:left="{filled * 100}%" style:width="{pledged * 100}%"></span>
		<span class="fill" style:transform="scaleX({filled})" style:animation-delay="{delay}ms"></span>
	</div>
</div>

<style>
	.meter {
		color: var(--signal);
	}
	.track {
		position: relative;
		height: 7px;
		overflow: hidden;
		background: color-mix(in srgb, currentColor 13%, transparent);
		mask-image: repeating-linear-gradient(90deg, #000 0 calc(5% - 2px), transparent calc(5% - 2px) 5%);
		-webkit-mask-image: repeating-linear-gradient(90deg, #000 0 calc(5% - 2px), transparent calc(5% - 2px) 5%);
	}
	.fill {
		position: absolute;
		inset: 0;
		background: currentColor;
		transform-origin: left;
		transition: transform 0.5s var(--ease-out);
		animation: grow 0.9s var(--ease-out) backwards;
	}
	.pledged {
		position: absolute;
		inset-block: 0;
		background: color-mix(in srgb, currentColor 42%, transparent);
		transition:
			left 0.5s var(--ease-out),
			width 0.5s var(--ease-out);
	}
	@keyframes grow {
		from {
			transform: scaleX(0);
		}
	}
</style>
