export function money(micro: number): string {
	const dollars = micro / 1_000_000;
	if (micro > 0 && micro < 10_000) return `$${dollars.toFixed(3)}`;
	return dollars.toLocaleString('en-GB', {
		style: 'currency',
		currency: 'USD',
		currencyDisplay: 'narrowSymbol',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});
}

const PLACES = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

/** "second" for 2, and "21st" for 21. */
export function place(rank: number): string {
	if (rank <= PLACES.length) return PLACES[rank - 1];
	const tens = rank % 100;
	const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][rank % 10] ?? 'th');
	return `${rank}${suffix}`;
}

/** The amount as it is shown, so that a stated difference agrees with the figures beside it. */
function shown(micro: number): number {
	return micro >= 10_000 ? Math.round(micro / 10_000) * 10_000 : micro;
}

/**
 * How one entry on a board stands against its neighbour. The amounts are in rank order, and
 * differences too small to be shown are described in words.
 */
export function standing(amounts: number[], index: number): string {
	const amount = amounts[index];
	if (amount <= 0) return 'Not yet funded.';
	if (index === 0) {
		const next = amounts[1];
		if (next === undefined || next <= 0) return '';
		if (next === amount) return 'Level with second place.';
		const lead = shown(amount) - shown(next);
		return lead < 1_000 ? 'Narrowly in the lead.' : `In the lead by ${money(lead)}.`;
	}
	const above = amounts[index - 1];
	const target = `${place(index)} place`;
	if (above === amount) return `Level with ${target}.`;
	const gap = shown(above) - shown(amount);
	return gap < 1_000 ? `Nearly level with ${target}.` : `${money(gap)} short of ${target}.`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
	return `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
}

const UNITS: [number, string][] = [
	[60, 'second'],
	[3600, 'minute'],
	[86400, 'hour'],
	[604800, 'day'],
	[2629800, 'week'],
	[31557600, 'month'],
	[Infinity, 'year']
];

export function timeAgo(ms: number, now = Date.now()): string {
	const seconds = Math.max(0, Math.round((now - ms) / 1000));
	if (seconds < 45) return 'just now';
	let divisor = 1;
	for (const [limit, unit] of UNITS) {
		if (seconds < limit) {
			const n = Math.max(1, Math.round(seconds / divisor));
			return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
		}
		divisor = limit;
	}
	return '';
}

export function fullDate(ms: number): string {
	return new Date(ms).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});
}

/** "Anthropic: Claude Sonnet 5.5" becomes "Claude Sonnet 5.5". */
export function shortModelName(name: string): string {
	const i = name.indexOf(': ');
	return i > 0 ? name.slice(i + 2) : name;
}

/** Round figures such as milestones, which are clearer without their cents. */
export function wholeMoney(micro: number): string {
	return `$${(micro / 1_000_000).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
}

/** A project's short public reference, which is shorter than its title and stays the same. */
export function reference(id: number): string {
	return `OS-${String(id).padStart(4, '0')}`;
}

const MILESTONES = [1, 5, 25, 100, 500, 2_500, 10_000, 50_000, 250_000].map((d) => d * 1_000_000);

/**
 * The next round figure above an amount. Milestones are shown only to indicate progress, and have
 * no effect on how a donation is spent.
 */
export function milestone(micro: number): number {
	return MILESTONES.find((m) => m > micro) ?? MILESTONES[MILESTONES.length - 1];
}

const SHORT_UNITS: [number, string][] = [
	[60, 's'],
	[3600, 'm'],
	[86400, 'h'],
	[604800, 'd'],
	[31557600, 'w'],
	[Infinity, 'y']
];

/** "2m", "5h", "3d": for places where a full phrase would not fit. */
export function shortAgo(ms: number, now = Date.now()): string {
	const seconds = Math.max(0, Math.round((now - ms) / 1000));
	let divisor = 1;
	for (const [limit, unit] of SHORT_UNITS) {
		if (seconds < limit) return `${Math.max(1, Math.floor(seconds / divisor))}${unit}`;
		divisor = limit;
	}
	return '';
}
