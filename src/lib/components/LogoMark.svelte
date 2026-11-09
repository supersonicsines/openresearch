<script lang="ts">
	let { size = 26 }: { size?: number } = $props();
</script>

<!-- The drawing in static/logo.svg, in the colours of the lead cell. -->
<svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
	<rect width="512" height="512" rx="114" fill="var(--lead)" />
	<g transform="rotate(-30 256 256)" fill="var(--lead-signal)">
		<rect x="34" y="232" width="72" height="48" />
		<rect x="406" y="232" width="72" height="48" />
	</g>
	<circle cx="256" cy="256" r="96" fill="none" stroke="var(--lead-ink)" stroke-width="48" />
</svg>
