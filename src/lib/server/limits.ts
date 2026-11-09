// Limits on how fast one visitor can use what is expensive. They are held in memory, so they reset
// when the server restarts, which is acceptable for protection against floods.

type Bucket = { count: number; resetAt: number };

const holder = globalThis as unknown as { __osLimits?: Map<string, Bucket>; __osStreams?: Map<string, number> };
const buckets = (holder.__osLimits ??= new Map());
const streams = (holder.__osStreams ??= new Map());

export const MINUTE = 60_000;
export const HOUR = 3_600_000;

let lastSweep = 0;

function sweep(now: number) {
	if (now - lastSweep < MINUTE) return;
	lastSweep = now;
	for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}

/** Counts one use. Returns the seconds to wait if the limit has been reached, otherwise 0. */
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): number {
	if (limit <= 0) return 0;
	sweep(now);
	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return 0;
	}
	if (bucket.count >= limit) return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
	bucket.count += 1;
	return 0;
}

export function resetLimits() {
	buckets.clear();
	streams.clear();
}

const MAX_STREAMS_PER_ADDRESS = 12;
const MAX_STREAMS = 3_000;
let openStreams = 0;

/** Live pages hold a connection open, so the number of them is limited. Returns a release function. */
export function openStream(address: string | null): (() => void) | null {
	if (openStreams >= MAX_STREAMS) return null;
	const key = address ?? '';
	const held = streams.get(key) ?? 0;
	if (address && held >= MAX_STREAMS_PER_ADDRESS) return null;
	streams.set(key, held + 1);
	openStreams += 1;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		openStreams -= 1;
		const left = (streams.get(key) ?? 1) - 1;
		if (left > 0) streams.set(key, left);
		else streams.delete(key);
	};
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** One visitor is commonly given a whole IPv6 /64, so that is what is counted. */
export function addressKey(address: string): string {
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
	if (mapped) return mapped[1];
	if (!address.includes(':')) return address;
	const [head, tail = ''] = address.split('%')[0].split('::');
	const left = head ? head.split(':') : [];
	const right = tail ? tail.split(':') : [];
	const fill = Array(Math.max(0, 8 - left.length - right.length)).fill('0');
	const groups = [...left, ...fill, ...right].slice(0, 4).map((g) => g.toLowerCase().padStart(4, '0'));
	return `${groups.join(':')}::/64`;
}

/** The path as the router will see it, so that "/%63ard/" cannot avoid the limit on "/card/". */
export function routedPath(pathname: string): string {
	try {
		return decodeURI(pathname);
	} catch {
		return pathname;
	}
}

/**
 * The visitor's address, where one can honestly be determined. Behind a proxy with ADDRESS_HEADER
 * unset, every visitor appears to come from the proxy. They must not then share one allowance, so
 * no address is reported and only limits tied to an account apply.
 */
export function clientKey(getClientAddress: () => string): string | null {
	let address: string;
	try {
		address = getClientAddress();
	} catch {
		return null;
	}
	if (LOOPBACK.has(address) && !process.env.ADDRESS_HEADER) return null;
	return addressKey(address);
}

type Rule = { name: string; limit: number; windowMs: number };

/** Limits by address, applied to every request before it reaches a page. */
export function ruleFor(method: string, path: string): Rule | null {
	if (path.startsWith('/card/')) return { name: 'card', limit: 90, windowMs: MINUTE };
	if (path.endsWith('/archive.zip')) return { name: 'zip', limit: 12, windowMs: MINUTE };
	// A clone asks for each object in turn, so this has to allow a great many requests.
	if (path.startsWith('/git/')) return { name: 'git', limit: 3_000, windowMs: MINUTE };
	if (path.startsWith('/auth/x')) return { name: 'auth', limit: 30, windowMs: MINUTE };
	if (path === '/api/activity') return { name: 'activity', limit: 120, windowMs: MINUTE };
	if (method !== 'GET' && method !== 'HEAD') return { name: 'write', limit: 120, windowMs: MINUTE };
	return { name: 'read', limit: 1_200, windowMs: MINUTE };
}
