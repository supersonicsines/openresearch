<script lang="ts">
	import { money, shortAgo } from '#lib/format.ts';

	type Point = { at: number; micro: number };
	let {
		points,
		height = 64,
		fill = false,
		interactive = false
	}: {
		points: Point[];
		height?: number;
		/** Takes the height of its container, in place of a fixed height. */
		fill?: boolean;
		interactive?: boolean;
	} = $props();

	const WIDTH = 320;

	const domain = $derived.by(() => {
		const first = points[0]?.at ?? 0;
		const last = points.at(-1)?.at ?? 0;
		return { first, span: Math.max(last - first, 1), top: Math.max(points.at(-1)?.micro ?? 0, 1) };
	});
	const xOf = (at: number) => ((at - domain.first) / domain.span) * WIDTH;
	const yOf = (micro: number) => height - 2 - (micro / domain.top) * (height - 6);

	// Money arrives in steps, so it is drawn in steps. A sloped line would imply it arrived gradually.
	const line = $derived.by(() => {
		if (points.length === 0) return '';
		let d = `M0 ${height - 2}`;
		for (const p of points) d += ` H${xOf(p.at).toFixed(1)} V${yOf(p.micro).toFixed(1)}`;
		return `${d} H${WIDTH}`;
	});
	const area = $derived(line ? `${line} V${height} H0 Z` : '');

	let hover = $state<number | null>(null);
	let box = $state<HTMLElement>();

	function move(event: PointerEvent) {
		if (!box) return;
		const rect = box.getBoundingClientRect();
		const at = domain.first + ((event.clientX - rect.left) / rect.width) * domain.span;
		let best = 0;
		for (let i = 0; i < points.length; i++) if (points[i].at <= at) best = i;
		hover = best;
	}
	const active = $derived(hover === null ? null : points[hover]);
</script>

{#if points.length > 1}
	<div
		class="spark"
		class:interactive
		bind:this={box}
		style:height={fill ? '100%' : `${height}px`}
		aria-hidden={!interactive}
		role={interactive ? 'img' : undefined}
		aria-label={interactive ? `Funding over time, reaching ${money(points.at(-1)!.micro)}` : undefined}
		onpointermove={interactive ? move : undefined}
		onpointerleave={interactive ? () => (hover = null) : undefined}
	>
		<svg viewBox="0 0 {WIDTH} {height}" preserveAspectRatio="none" width="100%" height={fill ? '100%' : height}>
			<path d={area} class="area" />
			<path d={line} class="line" vector-effect="non-scaling-stroke" />
		</svg>
		{#if active}
			<span class="rule" style:left="{(xOf(active.at) / WIDTH) * 100}%"></span>
			<span class="tip" style:left="{Math.min(Math.max((xOf(active.at) / WIDTH) * 100, 22), 78)}%">
				{money(active.micro)}, {shortAgo(active.at)} ago
			</span>
		{/if}
	</div>
{/if}

<style>
	.spark {
		position: relative;
		width: 100%;
		color: var(--spark, var(--signal));
	}
	svg {
		display: block;
		overflow: visible;
	}
	.line {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linejoin: round;
	}
	.area {
		fill: currentColor;
		opacity: 0.1;
	}
	.interactive {
		cursor: crosshair;
		touch-action: pan-y;
	}
	.rule {
		position: absolute;
		inset-block: 0;
		width: 1px;
		background: var(--ink-3);
		pointer-events: none;
	}
	.tip {
		position: absolute;
		top: -6px;
		translate: -50% -100%;
		padding: 3px 7px;
		background: var(--ink);
		color: var(--bg);
		border-radius: 5px;
		font: 400 0.75rem/1.3 var(--mono);
		white-space: nowrap;
		pointer-events: none;
	}
</style>
