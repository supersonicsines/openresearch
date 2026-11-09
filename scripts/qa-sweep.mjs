// `npm run qa:sweep`: reads every word on every page, in each state, at many widths. It found bugs that
// the browser tests had passed: words run together, text cut off, controls overlapping, pages overflowing.
//
// It needs a site with sample data and an administrator. In one terminal:
//   ADMIN_HANDLES=boss CONTACT_EMAIL=hello@example.org DEMO_DATA_DIR=data-e2e BUILD_DIR=build-e2e PORT=4173 MOCK_PORT=8798 node scripts/demo.mjs --build --no-open
// When that reports that it is running, in another:
//   npm run qa:sweep                    Chrome only
//   npm run qa:sweep -- --all-engines   also the Safari and Firefox engines, after: npx playwright install webkit firefox
//
// The results are in test-results/qa/issues.txt. Words not in the dictionary are printed, and should be read by
// eye: "submita" would appear there. Many of the small tap targets and some overlaps are harmless, such as the sticky
// Donate button passing over a list, so that file is to be read, not simply counted.
import { chromium, webkit, firefox } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const OUT = 'test-results/qa';
mkdirSync(OUT, { recursive: true });
const O = process.env.QA_BASE || 'http://localhost:4173';
const WORDS = '/usr/share/dict/words';
if (!existsSync(WORDS)) console.warn(`${WORDS} was not found, so every word will be listed as unknown.`);
const dict = new Set(existsSync(WORDS) ? readFileSync(WORDS, 'utf8').toLowerCase().split('\n') : []);
const known = new Set(`openresearch openrouter github pkce md html zip x or-.. sk-or api ai http https svelte ref sonnet opus haiku gemini grok deepseek qwen mistral claude gpt luna flash ofgem aes gcm usa unreviewed ok programme organisation offshore perovskite decommissioning bilingual antibiotic antibiotics prescribing rota rotas wearable wearables`.split(/\s+/));
const inflect = (w) => [w, w.replace(/s$/, ''), w.replace(/es$/, ''), w.replace(/ed$/, ''), w.replace(/ed$/, 'e'), w.replace(/ing$/, ''), w.replace(/ing$/, 'e'), w.replace(/ies$/, 'y'), w.replace(/ied$/, 'y'), w.replace(/ly$/, ''), w.replace(/d$/, ''), w.replace(/ised$/, 'ize'), w.replace(/ise$/, 'ize'), w.replace(/ising$/, 'ize'), w.replace(/([a-z])\1ed$/, '$1'), w.replace(/([a-z])\1ing$/, '$1'), w.replace(/er$/, ''), w.replace(/'s$/, ''), w.replace(/s'$/, '')];
const unknownWords = new Map(), issues = [];
const note = (kind, where, detail) => issues.push(`${kind.padEnd(10)} ${where}  ${detail}`);

function checkText(where, text) {
	for (const m of text.matchAll(/undefined|\bnull\b|\bNaN\b|\[object|\{\{|\}\}|\s[,.;:](\s|$)|\.\.(?!\.)|,,|\$\s\d/g)) note('TEXT', where, JSON.stringify(text.slice(Math.max(0, m.index - 25), m.index + 25)));
	for (const m of text.matchAll(/[a-z][A-Z][a-z]/g)) {
		const around = text.slice(Math.max(0, m.index - 12), m.index + 12);
		if (!/OpenResearch|OpenRouter|GitHub|DeepSeek/.test(around)) note('GLUED', where, JSON.stringify(around));
	}
	for (const m of text.matchAll(/\d[a-zA-Z]{3,}|[a-z]{2}\$\d|[a-z]@[a-zA-Z]/g)) note('GLUED', where, JSON.stringify(text.slice(Math.max(0, m.index - 14), m.index + 14)));
	const clean = text.replace(/@[A-Za-z0-9_-]+/g, ' ').replace(/https?:\S+/g, ' ').replace(/sk-or\S*/g, ' ').replace(/OR-\d+/g, ' ').replace(/[$+]?[\d,.]+[a-z%]{0,2}\b/g, ' ');
	for (const raw of clean.split(/[^A-Za-z'’-]+/)) {
		const w = raw.toLowerCase().replace(/^['’-]+|['’-]+$/g, '').replace(/’/g, "'");
		if (w.length < 2 || known.has(w)) continue;
		if (w.split('-').every((p) => inflect(p).some((v) => dict.has(v)) || known.has(p))) continue;
		if (!unknownWords.has(w)) unknownWords.set(w, where);
	}
}

const inspect = () => {
	const out = { clipped: [], small: [], overlap: [], offscreen: [], h1: document.querySelectorAll('h1').length, title: document.title, desc: document.querySelector('meta[name=description]')?.content ?? '', overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
	const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[aria-hidden="true"]'); };
	const name = (el) => `${el.tagName.toLowerCase()}.${(el.className?.baseVal ?? el.className ?? '').toString().split(' ').filter((c) => !c.startsWith('svelte')).join('.')} "${(el.innerText ?? '').trim().slice(0, 36).replace(/\n/g, ' ')}"`;
	for (const el of document.querySelectorAll('main *, header *, footer *')) {
		if (!visible(el) || el.closest('.ticker,.belt,.tabs,.ss-stage,.osd,svg,.models') ) continue;
		const s = getComputedStyle(el);
		const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
		if (hasText && s.overflow !== 'visible' && el.scrollWidth > el.clientWidth + 1) out.clipped.push(`${name(el)} ${el.scrollWidth}>${el.clientWidth}`);
		if (hasText && s.webkitLineClamp === 'none' && s.overflow !== 'visible' && el.scrollHeight > el.clientHeight + 2) out.clipped.push(`${name(el)} tall ${el.scrollHeight}>${el.clientHeight}`);
	}
	const controls = [...document.querySelectorAll('a[href],button,input,textarea,select,label')].filter((el) => visible(el) && !el.closest('.ticker .belt,.ss-stage,.osd'));
	for (const el of controls) {
		const r = el.getBoundingClientRect();
		const inline = getComputedStyle(el).display === 'inline' && el.parentElement && /P|LI|SPAN|TD/.test(el.parentElement.tagName);
		const isCover = el.classList.contains('title');
		if (!inline && !isCover && (r.width < 24 || r.height < 24)) out.small.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
		if (r.right > innerWidth + 1 || r.left < -1) out.offscreen.push(`${name(el)} ${Math.round(r.left)}..${Math.round(r.right)}`);
	}
	for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
		const a = controls[i], b = controls[j];
		if (a.contains(b) || b.contains(a)) continue;
		const r = a.getBoundingClientRect(), q = b.getBoundingClientRect();
		const x = Math.min(r.right, q.right) - Math.max(r.left, q.left), y = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
		if (x > 2 && y > 2) out.overlap.push(`${name(a)} / ${name(b)}`);
	}
	return out;
};

const b = await chromium.launch({ channel: 'chrome' });
async function session(browser, handle, opts = {}) {
	const ctx = await browser.newContext({ baseURL: O, ...opts });
	const page = await ctx.newPage();
	if (handle) {
		await page.goto('/auth/dev?next=/');
		await page.getByLabel('Handle').fill(handle);
		await page.getByRole('button', { name: 'Continue' }).click();
		// Sign-in finishes with a client-side navigation, so the account chip is what is waited for.
		try {
			await page.locator('.account').waitFor({ timeout: 12000 });
		} catch {
			note('SIGNIN', `${browser.browserType().name()} ${JSON.stringify(opts.viewport ?? {})}`, `no account chip; at ${page.url()}`);
			await page.screenshot({ path: `${OUT}/signin-fail-${browser.browserType().name()}-${opts.viewport?.width}.png` });
		}
	}
	return { ctx, page };
}
const seed = await session(b, `qa${Date.now() % 100000}`);
await seed.page.evaluate(async () => { await fetch('/api/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'sk-or-v1-capped-qa' }) }); });
const list = await (await seed.page.request.get('/api/activity')).json();
const top = list.items.find((i) => i.kind === 'completed').slug;
await seed.page.goto('/submit'); await seed.page.getByLabel('Prompt').fill('Which measures reduce fatigue among nurses on rotating shifts, according to controlled trials?'); await seed.page.getByRole('button', { name: 'Submit prompt' }).click(); await seed.page.waitForURL(/\/p\//);
const fresh = new URL(seed.page.url()).pathname.split('/')[2];
await seed.page.evaluate(async (s) => { await fetch(`/api/projects/${s}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'A sample report, so that the admin page has something on it.' }) }); }, fresh);
await seed.ctx.close();

const PAGES = ['/', '/?sort=rising', '/?sort=recent', '/prompts', '/prompts?sort=donated', '/prompts?filter=live', '/prompts?filter=funded', '/prompts?filter=unfunded', '/prompts?q=heat', '/prompts?q=zzzzqqq', '/leaderboards', '/leaderboards?period=7', '/leaderboards?board=donors', '/leaderboards?board=donors&period=30', '/about', '/terms', '/privacy', '/submit', `/u/${'h-ashworth'}`, `/p/${top}`, `/p/${top}/runs`, `/p/${top}/runs/1`, `/p/${top}/repository`, `/p/${fresh}`, '/this-does-not-exist', '/p/nothing', '/auth/unavailable?reason=expired', '/auth/unavailable?reason=failed', '/auth/unavailable?reason=suspended', '/auth/unavailable'];
const PRIVATE = ['/account', '/admin', ...PAGES.slice(0, 4)];
const titles = new Map();
async function sweep(label, browser, handleName, pages, widths, scheme = 'light') {
	for (const width of widths) {
		const s = await session(browser, handleName, { viewport: { width, height: 900 }, colorScheme: scheme });
		s.page.on('pageerror', (e) => note('JS', `${label}@${width} ${s.page.url()}`, String(e).slice(0, 140)));
		s.page.on('console', (m) => { if (m.type() === 'error' && !/40[0-9]|410|status of 4/.test(m.text())) note('CONSOLE', `${label}@${width} ${s.page.url()}`, m.text().slice(0, 140)); });
		for (const path of pages) {
			const where = `${label}@${width} ${path}`;
			let res;
			try {
				res = await s.page.goto(path, { waitUntil: 'load', timeout: 20000 });
			} catch (e) {
				note('GOTO', where, String(e).slice(0, 120));
				continue;
			}
			writeFileSync(`${OUT}/issues-partial.txt`, [...new Set(issues)].join('\n'));
			await s.page.waitForTimeout(150);
			if (res.status() >= 500) note('STATUS', where, String(res.status()));
			checkText(where, await s.page.locator('body').innerText());
			const r = await s.page.evaluate(inspect);
			if (r.overflow > 0) note('OVERFLOW', where, `${r.overflow}px`);
			if (r.h1 !== 1) note('H1', where, `${r.h1} h1 elements`);
			if (!r.title) note('TITLE', where, 'empty');
			if (width === widths[0]) { if (!titles.has(r.title)) titles.set(r.title, path); }
			for (const c of r.clipped) note('CLIPPED', where, c);
			if (width <= 500) for (const c of r.small) note('SMALL', where, c);
			for (const c of r.offscreen) note('OFFSCREEN', where, c);
			for (const c of r.overlap) note('OVERLAP', where, c);
		}
		await s.ctx.close();
	}
}
await sweep('chrome', b, null, PAGES, [1440, 1024, 768, 600, 390, 320]);
await sweep('chrome-dark', b, null, PAGES.slice(0, 8), [1280, 390], 'dark');
await sweep('signed-in', b, 'boss', PRIVATE, [1280, 768, 390, 320]);
const engines = process.argv.includes('--all-engines') ? [['webkit', webkit], ['firefox', firefox]] : [];
for (const [name, engine] of engines) {
	const br = await engine.launch();
	await sweep(name, br, null, PAGES.slice(0, 26), [1280, 390]);
	await sweep(`${name}-in`, br, 'boss', ['/account', '/admin', '/', '/submit'], [1280, 390]);
	console.log('finished', name);
	await br.close();
}
await b.close();
const dedupe = [...new Set(issues)];
writeFileSync(`${OUT}/issues.txt`, dedupe.join('\n'));
const byKind = {};
for (const line of dedupe) { const k = line.split(/\s+/)[0]; byKind[k] = (byKind[k] ?? 0) + 1; }
console.log('issues by kind', byKind);
console.log('\nwords not in the dictionary:');
console.log([...unknownWords.entries()].map(([w, where]) => `${w} (${where.split(' ').slice(1).join(' ').slice(0, 26)})`).join(', '));
console.log('\npages:', titles.size, 'distinct titles');
for (const [t, p] of titles) console.log(' ', t.slice(0, 70), '<-', p.slice(0, 40));
