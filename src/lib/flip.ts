// Cells change size as they change rank, so only their position is animated. Neither `animate:` nor a
// pair of effects produced any movement in a production build, so the caller measures before an update
// and plays the returned function after it.

const cells = () => document.querySelectorAll<HTMLElement>('[data-flip] [data-key]');

export function captureFlip(): () => void {
	if (typeof matchMedia === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
	const before = new Map([...cells()].map((el) => [el.dataset.key!, el.getBoundingClientRect()]));
	return () => {
		for (const el of cells()) {
			const from = before.get(el.dataset.key!);
			if (!from) continue;
			for (const running of el.getAnimations()) running.cancel();
			const to = el.getBoundingClientRect();
			const dx = from.left - to.left;
			const dy = from.top - to.top;
			if (!dx && !dy) continue;
			el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
				duration: 320,
				easing: 'cubic-bezier(0.23, 1, 0.32, 1)'
			});
		}
	};
}
