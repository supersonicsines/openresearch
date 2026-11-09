import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import satori from 'satori';

const WIDTH = 1200;
const HEIGHT = 630;

const GROUND = '#0e1c30';
const INK = '#f4f7fb';
const MUTED = '#a6b2c2';
const RULE = '#2a3a50';
const SIGNAL = '#5fe3a8';
const GRID = 'rgba(255,255,255,0.05)';

type Node = { type: string; props: Record<string, unknown> };

function h(type: string, style: Record<string, unknown>, ...children: (Node | string | null)[]): Node {
	const kids = children.filter((c) => c !== null);
	return {
		type,
		props: {
			style: { display: 'flex', ...style },
			children: kids.length === 1 ? kids[0] : kids
		}
	};
}

function loadFonts() {
	const dir = join(process.cwd(), 'assets', 'card-fonts');
	const fonts: { name: string; data: Buffer; weight: 400 | 500 | 600; style: 'normal' }[] = [];
	for (const subset of ['latin', 'latin-ext', 'greek', 'cyrillic']) {
		for (const weight of [400, 600] as const) {
			fonts.push({
				name: 'Source Serif 4',
				data: readFileSync(join(dir, `source-serif-4-${subset}-${weight}-normal.woff`)),
				weight,
				style: 'normal'
			});
		}
	}
	for (const weight of [400, 500] as const) {
		fonts.push({
			name: 'IBM Plex Mono',
			data: readFileSync(join(dir, `ibm-plex-mono-latin-${weight}-normal.woff`)),
			weight,
			style: 'normal'
		});
	}
	return fonts;
}

const holder = globalThis as unknown as {
	__osCards?: { ready: Promise<void>; fonts: ReturnType<typeof loadFonts> };
};

function engine() {
	return (holder.__osCards ??= {
		ready: (async () => {
			const require = createRequire(import.meta.url);
			const wasm = readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm'));
			await initWasm(wasm);
		})(),
		fonts: loadFonts()
	});
}

/** The card fonts cover Latin, Greek and Cyrillic. Other scripts are left out of images. */
export function cardText(text: string, fallback = 'A research prompt'): string {
	const safe = text
		.replace(/[^ -ɏͰ-ϿЀ-ӿḀ-ỿ‐-‧‰-⁞₠-₿\s]/gu, '')
		.replace(/\s+/g, ' ')
		.trim();
	return /[\p{L}\p{N}]/u.test(safe) ? safe : fallback;
}

function clip(text: string, max: number): string {
	if (text.length <= max) return text;
	const cut = text.slice(0, max - 1);
	return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 24)).trimEnd()}…`;
}

function headlineSize(length: number): number {
	if (length < 60) return 66;
	if (length < 110) return 56;
	if (length < 170) return 46;
	return 39;
}

type Stat = { value: string; label: string };

const MONO = 'IBM Plex Mono';

function statRow(items: Stat[]): Node {
	return h(
		'div',
		{ gap: 48 },
		...items.map((s) =>
			h(
				'div',
				{ alignItems: 'baseline', gap: 10 },
				h('div', { fontFamily: MONO, fontSize: 26, fontWeight: 500, color: INK, letterSpacing: -0.6 }, s.value),
				h('div', { fontFamily: MONO, fontSize: 20, color: MUTED }, s.label)
			)
		)
	);
}

/** The same twenty segments as the meter on the site. */
function meter(fraction: number): Node {
	const filled = Math.round(Math.min(Math.max(fraction, 0), 1) * 20);
	return h(
		'div',
		{ gap: 4, width: '100%' },
		...Array.from({ length: 20 }, (_, i) =>
			h('div', { flexGrow: 1, height: 12, background: i < filled ? SIGNAL : 'rgba(95,227,168,0.16)' })
		)
	);
}

/** The drawing in static/logo.svg without its tile, which is the colour of the card. */
const MARK = `data:image/svg+xml,${encodeURIComponent(
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="45 118 422 276"><g transform="rotate(-30 256 256)" fill="${SIGNAL}"><rect x="34" y="232" width="72" height="48"/><rect x="406" y="232" width="72" height="48"/></g><circle cx="256" cy="256" r="96" fill="none" stroke="${INK}" stroke-width="48"/></svg>`
)}`;

function header(reference?: string): Node {
	return h(
		'div',
		{ justifyContent: 'space-between', alignItems: 'center' },
		h(
			'div',
			{ alignItems: 'center', gap: 14 },
			{ type: 'img', props: { src: MARK, width: 52, height: 34 } },
			h('div', { fontSize: 32, fontWeight: 600, letterSpacing: -0.4 }, 'OpenResearch')
		),
		reference ? h('div', { fontFamily: MONO, fontSize: 24, color: MUTED }, reference) : null
	);
}

function raised(amount: string, target: string, fraction: number, items: Stat[]): Node {
	return h(
		'div',
		{ flexDirection: 'column', gap: 16 },
		h(
			'div',
			{ justifyContent: 'space-between', alignItems: 'baseline' },
			h(
				'div',
				{ alignItems: 'baseline', gap: 14 },
				h('div', { fontFamily: MONO, fontSize: 64, fontWeight: 500, letterSpacing: -2.4, color: SIGNAL }, amount),
				h('div', { fontFamily: MONO, fontSize: 24, color: MUTED }, 'raised')
			),
			statRow(items)
		),
		meter(fraction),
		h('div', { fontFamily: MONO, fontSize: 20, color: MUTED }, `of the ${target} milestone`)
	);
}

function frame(children: (Node | null)[]): Node {
	return h(
		'div',
		{
			width: WIDTH,
			height: HEIGHT,
			boxSizing: 'border-box',
			flexDirection: 'column',
			justifyContent: 'space-between',
			padding: '52px 64px 46px',
			backgroundColor: GROUND,
			backgroundImage: `linear-gradient(${GRID} 1px, transparent 1px), linear-gradient(90deg, ${GRID} 1px, transparent 1px)`,
			backgroundSize: '40px 40px',
			fontFamily: 'Source Serif 4',
			color: INK
		},
		...children
	);
}

async function toPng(node: Node): Promise<Uint8Array> {
	const { ready, fonts } = engine();
	await ready;
	const svg = await satori(node as never, { width: WIDTH, height: HEIGHT, fonts });
	const image = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render();
	const png = image.asPng();
	image.free();
	return png;
}

async function avatarData(url: string | null): Promise<string | null> {
	if (!url) return null;
	try {
		const parsed = new URL(url);
		if (parsed.hostname !== 'avatars.githubusercontent.com') return null;
		const res = await fetch(parsed, { signal: AbortSignal.timeout(3000) });
		if (!res.ok) return null;
		const type = res.headers.get('content-type') ?? 'image/jpeg';
		if (!/^image\/(jpeg|png)$/.test(type)) return null;
		const bytes = Buffer.from(await res.arrayBuffer());
		return `data:${type};base64,${bytes.toString('base64')}`;
	} catch {
		return null;
	}
}

function picture(src: string | null, size: number): Node | null {
	if (!src) return null;
	return { type: 'img', props: { src, width: size, height: size, style: { borderRadius: size / 2 } } };
}

function identity(handle: string, avatar: string | null, size = 30): Node {
	return h(
		'div',
		{ alignItems: 'center', gap: 12 },
		picture(avatar, Math.round(size * 1.4)),
		h('div', { fontFamily: MONO, fontSize: size, fontWeight: 500, letterSpacing: -0.5 }, `@${cardText(handle, 'unknown')}`)
	);
}

export type RaisedFigures = { amount: string; target: string; fraction: number; items: Stat[] };

export async function projectCard(input: RaisedFigures & { title: string; reference: string; handle: string; avatarUrl: string | null }) {
	const title = clip(cardText(input.title), 190);
	const avatar = await avatarData(input.avatarUrl);
	return toPng(
		frame([
			header(input.reference),
			h(
				'div',
				{ flexDirection: 'column', gap: 18 },
				h('div', { fontSize: headlineSize(title.length) - 6, lineHeight: 1.14, letterSpacing: -0.6, maxWidth: 1060, wordBreak: 'break-word' }, title),
				identity(input.handle, avatar)
			),
			raised(input.amount, input.target, input.fraction, input.items)
		])
	);
}

export async function donationCard(input: {
	handle: string;
	avatarUrl: string | null;
	verb: string;
	amount: string;
	title: string;
	reference: string;
	items: Stat[];
}) {
	const title = clip(cardText(input.title), 170);
	const avatar = await avatarData(input.avatarUrl);
	return toPng(
		frame([
			header(input.reference),
			h(
				'div',
				{ flexDirection: 'column', gap: 16 },
				h(
					'div',
					{ alignItems: 'baseline', gap: 16 },
					h('div', { fontFamily: MONO, fontSize: 64, fontWeight: 500, letterSpacing: -2.4, color: SIGNAL }, input.amount),
					h('div', { fontFamily: MONO, fontSize: 24, color: MUTED }, input.verb)
				),
				h('div', { fontSize: headlineSize(title.length) - 12, lineHeight: 1.16, letterSpacing: -0.5, maxWidth: 1060, wordBreak: 'break-word' }, title)
			),
			h(
				'div',
				{ justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${RULE}`, paddingTop: 22 },
				identity(input.handle, avatar),
				statRow(input.items)
			)
		])
	);
}

export async function donorCard(input: { handle: string; name: string; avatarUrl: string | null; items: Stat[] }) {
	const avatar = await avatarData(input.avatarUrl);
	const handle = cardText(input.handle, 'donor');
	const name = cardText(input.name, handle);
	return toPng(
		frame([
			header(),
			h(
				'div',
				{ alignItems: 'center', gap: 36 },
				picture(avatar, 132),
				h(
					'div',
					{ flexDirection: 'column', gap: 8 },
					h('div', { fontFamily: MONO, fontSize: 62, fontWeight: 500, lineHeight: 1.1, letterSpacing: -2 }, `@${handle}`),
					name !== handle ? h('div', { fontSize: 32, color: MUTED }, clip(name, 40)) : null
				)
			),
			h('div', { borderTop: `1px solid ${RULE}`, paddingTop: 22 }, statRow(input.items))
		])
	);
}

export function siteCard(input: { items: Stat[] }) {
	return toPng(
		frame([
			header(),
			h(
				'div',
				{ fontSize: 66, lineHeight: 1.12, letterSpacing: -1, maxWidth: 1040 },
				'Any prompt may be listed. Those that are funded are researched in public.'
			),
			h('div', { borderTop: `1px solid ${RULE}`, paddingTop: 22 }, statRow(input.items))
		])
	);
}

// A card is drawn on the server's only thread, so the same one is not drawn twice. Each key includes
// the figures shown, so a card is replaced as soon as they change.
const MAX_CACHED = 300;
const cache = new Map<string, Promise<Uint8Array>>();

export function cachedCard(key: string, draw: () => Promise<Uint8Array>): Promise<Uint8Array> {
	const hit = cache.get(key);
	if (hit) return hit;
	const pending = draw().catch((err) => {
		cache.delete(key);
		throw err;
	});
	cache.set(key, pending);
	if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
	return pending;
}

export function pngResponse(png: Uint8Array, maxAge: number) {
	return new Response(new Uint8Array(png), {
		headers: { 'Content-Type': 'image/png', 'Cache-Control': `public, max-age=${maxAge}` }
	});
}
