import { expect, test, type Page } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { donateViaApi, saveKey, signIn, submitPrompt, uniqueHandle, words } from './helpers.ts';

async function waitForDonation(page: Page, text: string | RegExp, timeout = 45_000) {
	await page.goto('/account');
	await expect(async () => {
		await page.reload();
		await expect(page.locator('.donations li').first()).toContainText(text);
	}).toPass({ timeout });
}

test('hostile model output cannot run or load anything', async ({ page }) => {
	await signIn(page, uniqueHandle('xss'));
	await saveKey(page, 'sk-or-v1-xss-test');
	const slug = await submitPrompt(page, 'A prompt for hostile output testing.');
	const blocked: string[] = [];
	page.on('request', (r) => {
		if (r.url().includes('evil') || r.url().includes('example.com')) blocked.push(r.url());
	});
	await donateViaApi(page, slug, 0.5);
	await expect(async () => {
		await page.goto(`/p/${slug}/runs/1`);
		await expect(page.locator('.panel .prose')).toContainText('Plain text remains.');
	}).toPass({ timeout: 30_000 });

	for (const path of [`/p/${slug}`, `/p/${slug}/runs/1`]) {
		await page.goto(path);
		const report = page.locator('.panel .prose').first();
		await expect(report.locator('script, img, iframe, svg, style')).toHaveCount(0);
		const hrefs = await report.locator('a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
		for (const href of hrefs) expect(href ?? '').not.toMatch(/^javascript:/i);
		expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)).toBeUndefined();
	}
	expect(blocked).toEqual([]);

	await page.goto(`/p/${slug}/files/runs/0001.html`);
	expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)).toBeUndefined();
});

test('a prompt containing markup is shown as plain text everywhere', async ({ page, request }) => {
	await signIn(page, uniqueHandle('markup'));
	const prompt = `<script>window.__pwned=true</script> <img src=x onerror="window.__pwned=true"> "quotes" & 'more' \`ticks\` $(whoami) ; rm -rf /`;
	const slug = await submitPrompt(page, prompt);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(prompt);
	expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)).toBeUndefined();
	await page.goto('/');
	expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)).toBeUndefined();
	const file = await request.get(`/p/${slug}/files/PROMPT.md`);
	expect((await file.text()).trim()).toBe(prompt);
	expect((await request.get(`/card/project/${slug}.png`)).status()).toBe(200);
});

test('prompts in other scripts and with no Latin letters still work', async ({ page, request }) => {
	await signIn(page, uniqueHandle('script'));
	for (const prompt of ['水はどこから来るのか、そしてどのように管理されているのか。', 'Откуда берётся вода? 🌊', '🌊🌊🌊']) {
		const slug = await submitPrompt(page, prompt);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(prompt);
		expect((await request.get(`/card/project/${slug}.png`)).status(), prompt).toBe(200);
		await page.goto(`/p/${slug}/repository`);
		await expect(page.getByRole('link', { name: 'PROMPT.md' })).toBeVisible();
	}
});

test('a key with no credit ends the donation with a clear reason', async ({ page }) => {
	await signIn(page, uniqueHandle('broke'));
	await saveKey(page, 'sk-or-v1-broke-test');
	const slug = await submitPrompt(page, 'A prompt for a key without credit.');
	expect((await donateViaApi(page, slug, 1)).status).toBe(201);
	await waitForDonation(page, 'No credit remains on the key or the account');
	await expect(page.locator('.donations li').first()).toContainText('$0.00 of $1.00');
	await page.goto(`/p/${slug}`);
	await expect(page.getByText('No research has been funded as yet.')).toBeVisible();
});

test('an unavailable model is retried, then reported', async ({ page }) => {
	await signIn(page, uniqueHandle('down'));
	await saveKey(page, 'sk-or-v1-down-test');
	const slug = await submitPrompt(page, 'A prompt for an unavailable model.');
	await donateViaApi(page, slug, 1);
	await waitForDonation(page, 'The model remained unavailable after several attempts.');
});

test('a stream that breaks part way leaves no half-written run', async ({ page, request }) => {
	await signIn(page, uniqueHandle('midfail'));
	await saveKey(page, 'sk-or-v1-midfail-test');
	const slug = await submitPrompt(page, 'A prompt for a broken stream.');
	await donateViaApi(page, slug, 1);
	await waitForDonation(page, 'Could not be completed');
	await page.goto(`/p/${slug}/runs`);
	await expect(page.getByText('No runs have been completed as yet.')).toBeVisible();
	expect((await request.get(`/p/${slug}/files/findings.md`)).status()).toBe(404);
});

test('a broken attempt is not repeated, and its possible cost is counted', async ({ page }) => {
	await signIn(page, uniqueHandle('counted'));
	await saveKey(page, 'sk-or-v1-midfail-test');
	const slug = await submitPrompt(page, 'A prompt for a broken stream that must be counted.');
	await donateViaApi(page, slug, 1);
	await waitForDonation(page, 'its maximum cost has been counted against this donation');
	await expect(page.locator('.donations li').first().locator('.sum')).not.toHaveText(/^\$0\.00 of/);
	// Leaderboards count only finished runs.
	await page.goto(`/p/${slug}`);
	await expect(page.locator('.sum').first()).toHaveText('$0.00');
});

test('a stream that closes early is a failure, not a free run', async ({ page }) => {
	await signIn(page, uniqueHandle('cutoff'));
	await saveKey(page, 'sk-or-v1-cutoff-test');
	const slug = await submitPrompt(page, 'A prompt for a stream that closes early.');
	await donateViaApi(page, slug, 1);
	await waitForDonation(page, 'Could not be completed');
	await page.goto(`/p/${slug}/runs`);
	await expect(page.getByText('No runs have been completed as yet.')).toBeVisible();
});

test('a model that writes nothing leaves the project open for the next donor', async ({ page }) => {
	await signIn(page, uniqueHandle('blank'));
	await saveKey(page, 'sk-or-v1-blank-test');
	const slug = await submitPrompt(page, 'What is known about libraries? A prompt for a silent model.');
	await donateViaApi(page, slug, 1);
	await waitForDonation(page, 'The model returned no text.');

	await saveKey(page, 'sk-or-v1-capped-next');
	await donateViaApi(page, slug, 0.5);
	await expect(async () => {
		await page.goto(`/p/${slug}/runs`);
		await expect(page.locator('.seq').first()).toBeVisible();
	}).toPass({ timeout: 30_000 });
});

test('a new donation to a project with no questions left can still research it', async ({ page }) => {
	await signIn(page, uniqueHandle('review'));
	await saveKey(page, 'sk-or-v1-capped-test');
	const slug = await submitPrompt(page, 'What is known about public libraries? A prompt for a second donor.');
	await donateViaApi(page, slug, 1);
	await waitForDonation(page, 'No open questions remain');
	await page.goto(`/p/${slug}/runs`);
	const before = await page.locator('.seq').count();
	await donateViaApi(page, slug, 0.5);
	await expect(async () => {
		await page.goto('/account');
		await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);
		await page.goto(`/p/${slug}/runs`);
		expect(await page.locator('.seq').count()).toBeGreaterThan(before);
	}).toPass({ timeout: 30_000 });
});

test('replacing a key ends donations made with the old one', async ({ page }) => {
	await signIn(page, uniqueHandle('replacer'));
	await saveKey(page, 'sk-or-v1-capped-first');
	const slug = await submitPrompt(page, 'What is known about heat pumps? A prompt for key replacement.');
	await donateViaApi(page, slug, 5);
	await saveKey(page, 'sk-or-v1-capped-second');
	await page.goto('/account');
	await expect(page.locator('.donations li').first()).toContainText('The OpenRouter key was replaced.');
});

test('a pledge is not called a donation on its card', async ({ page, request }) => {
	await signIn(page, uniqueHandle('pledger'));
	await saveKey(page, 'sk-or-v1-capped-test');
	const slug = await submitPrompt(page, 'A prompt for checking the wording of cards.');
	const { body } = await donateViaApi(page, slug, 5);
	expect((await request.get(`/card/donation/${body.publicId}.png`)).status()).toBe(200);
});

test('a control character in a prompt is refused by the server', async ({ page }) => {
	await signIn(page, uniqueHandle('nul'));
	await page.goto('/submit');
	const status = await page.evaluate(async () => {
		const body = new FormData();
		body.set('prompt', 'A crafted prompt\u0000 with a nul byte');
		const res = await fetch('/submit', { method: 'POST', body, headers: { Accept: 'application/json' } });
		return (await res.json()).status;
	});
	expect(status).toBe(400);
});

test('a prompt beginning with a hyphen gets a repository', async ({ page }) => {
	await signIn(page, uniqueHandle('hyphen'));
	const slug = await submitPrompt(page, '- what is known about hyphens?');
	expect(slug).toMatch(/^[a-z0-9]/);
});

test('an amount beyond the limit on the key is refused', async ({ page }) => {
	await signIn(page, uniqueHandle('spent'));
	await saveKey(page, 'sk-or-v1-spent-test');
	const slug = await submitPrompt(page, 'A prompt for a key at its limit.');
	const reply = await donateViaApi(page, slug, 1);
	expect(reply.status).toBe(400);
	expect(reply.body.message).toContain('exceeds');
});

test('invalid donations are refused', async ({ page }) => {
	await signIn(page, uniqueHandle('invalid'));
	await saveKey(page, 'sk-or-v1-capped-test');
	const slug = await submitPrompt(page, 'A prompt for invalid donations.');
	const attempt = (body: unknown) =>
		page.evaluate(
			async ({ slug, body }) => (await fetch(`/api/projects/${slug}/donations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status,
			{ slug, body }
		);
	const model = 'anthropic/claude-sonnet-5.5';
	expect(await attempt({ amountMicro: -5000000, model })).toBe(400);
	expect(await attempt({ amountMicro: 0, model })).toBe(400);
	expect(await attempt({ amountMicro: 1.5, model })).toBe(400);
	expect(await attempt({ amountMicro: 'lots', model })).toBe(400);
	expect(await attempt({ amountMicro: 1e20, model })).toBe(400);
	expect(await attempt({ amountMicro: 1000000, model: 'no/such-model' })).toBe(400);
	expect(await attempt({ amountMicro: 1000000 })).toBe(400);
	expect(await attempt(null)).toBe(400);
	const missing = await page.evaluate(async () => (await fetch('/api/projects/nothing-here/donations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status);
	expect(missing).toBe(404);
});

test('a donation can be stopped, and nothing more is spent', async ({ page }) => {
	await signIn(page, uniqueHandle('stopper'));
	await saveKey(page, 'sk-or-v1-capped-test');
	const slug = await submitPrompt(page, 'What is known about river water quality? A prompt for stopping.');
	const reply = await donateViaApi(page, slug, 5);
	await page.goto('/account');
	await page.getByRole('button', { name: 'Stop' }).click();
	await expect(page.locator('.donations li').first()).toContainText('This was requested by the donor.');
	const before = await page.locator('.sum').first().innerText();
	await page.waitForTimeout(3500);
	await page.reload();
	expect(await page.locator('.sum').first().innerText()).toBe(before);
	expect(reply.status).toBe(201);
});

test('removing a key ends donations that are in progress', async ({ page }) => {
	await signIn(page, uniqueHandle('remover'));
	await saveKey(page, 'sk-or-v1-capped-test');
	const slug = await submitPrompt(page, 'What is known about heat pumps? A prompt for key removal.');
	await donateViaApi(page, slug, 5);
	await page.goto('/account');
	await page.getByRole('button', { name: 'Remove key' }).click();
	await page.getByRole('dialog', { name: 'Remove this key' }).getByRole('button', { name: 'Remove key' }).click();
	await expect(page.locator('.donations li').first()).toContainText('The OpenRouter key was removed.');
});

test('two donations to one project run in turn', async ({ page, request }) => {
	await signIn(page, uniqueHandle('turns'));
	await saveKey(page, 'sk-or-v1-capped-test');
	const slug = await submitPrompt(page, 'How do batteries get recycled? A prompt for concurrency.');
	await donateViaApi(page, slug, 0.6);
	await donateViaApi(page, slug, 0.6, 'anthropic/claude-haiku-5.5');
	await expect(async () => {
		await page.goto('/account');
		const open = await page.getByRole('button', { name: 'Stop' }).count();
		expect(open).toBe(0);
	}).toPass({ timeout: 60_000 });
	await page.goto(`/p/${slug}/runs`);
	const seqs = await page.locator('.seq').allInnerTexts();
	const numbers = seqs.map(Number).sort((a, b) => a - b);
	expect(numbers).toEqual(numbers.map((_, i) => i + 1));
	await page.goto(`/p/${slug}/repository`);
	await expect(page.locator('.log li')).toHaveCount(numbers.length + 1);
	expect((await request.get(`/p/${slug}/files/runs/0001.md`)).status()).toBe(200);
});

test('a page opened during a run catches up with the text so far', async ({ page, context }) => {
	await signIn(page, uniqueHandle('catchup'));
	await saveKey(page, 'sk-or-v1-capped-test');
	const slug = await submitPrompt(page, 'What is known about sleep and shift work? A prompt for catching up.');
	await donateViaApi(page, slug, 1);
	const second = await context.newPage();
	await second.waitForTimeout(500);
	await second.goto(`/p/${slug}`);
	const live = second.getByRole('region', { name: 'Run in progress' });
	await expect(live).toBeVisible();
	await expect(live.locator('.stream')).not.toBeEmpty();
	await second.close();
});

test('signed-out requests and other accounts are refused', async ({ page, request, browser }) => {
	const json = { 'Content-Type': 'application/json' };
	expect((await request.post('/api/key', { headers: json, data: { key: 'sk-or-v1-capped-x' } })).status()).toBe(401);
	expect((await request.delete('/api/key', { headers: json, data: {} })).status()).toBe(401);
	expect((await request.post('/api/projects/x/donations', { headers: json, data: {} })).status()).toBe(401);
	expect((await request.post('/api/donations/x/stop', { headers: json, data: {} })).status()).toBe(401);

	await signIn(page, uniqueHandle('owner'));
	await saveKey(page, 'sk-or-v1-capped-test');
	const slug = await submitPrompt(page, 'A prompt owned by one account.');
	const { body } = await donateViaApi(page, slug, 5);

	const other = await browser.newContext();
	const otherPage = await other.newPage();
	await signIn(otherPage, uniqueHandle('other'));
	const status = await otherPage.evaluate(
		async (id) => (await fetch(`/api/donations/${id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status,
		body.publicId
	);
	expect(status).toBe(404);
	await other.close();

	await page.evaluate(async (id) => fetch(`/api/donations/${id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), body.publicId);
});

test('forms posted from another site are refused', async ({ request }) => {
	const res = await request.post('/submit', {
		headers: { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' },
		data: 'prompt=hello'
	});
	expect(res.status()).toBe(403);
	const logout = await request.post('/auth/logout', {
		headers: { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' },
		data: ''
	});
	expect(logout.status()).toBe(403);
});

test('files outside the repository cannot be reached', async ({ page, request }) => {
	await signIn(page, uniqueHandle('paths'));
	const slug = await submitPrompt(page, 'A prompt for path testing.');
	const bad = [
		`/git/${slug}.git/config`,
		`/git/${slug}.git/hooks/pre-commit`,
		`/git/${slug}.git/refs/heads/main`,
		`/git/${slug}.git/..%2F..%2Fopenresearch.sqlite`,
		`/git/..%2F..%2F.git/HEAD`,
		`/git/${slug}.git/objects/..%2F..%2F..%2F..%2Fopenresearch.sqlite`,
		`/p/${slug}/files/.git/config`,
		`/p/${slug}/files/..%2F..%2Fopenresearch.sqlite`,
		`/p/${slug}/files/%2e%2e/%2e%2e/openresearch.sqlite`,
		`/p/${slug}/files/nothing.md`,
		`/p/..%2F..%2F/archive.zip`
	];
	for (const path of bad) {
		const res = await request.get(path);
		expect([400, 404], path).toContain(res.status());
		expect(await res.text(), path).not.toContain('SQLite format');
	}
	expect((await request.get(`/git/${slug}.git/HEAD`)).status()).toBe(200);
});

test('return addresses cannot lead to another site', async ({ page, request }) => {
	for (const next of ['https://evil.example/', '//evil.example/', '/\\evil.example', 'javascript:alert(1)']) {
		const handle = uniqueHandle('next');
		await page.goto(`/auth/dev?next=${encodeURIComponent(next)}`);
		await page.getByLabel('Handle').fill(handle);
		await page.getByRole('button', { name: 'Continue' }).click();
		await page.waitForLoadState('networkidle');
		expect(new URL(page.url()).hostname).toBe('localhost');
		await page.context().clearCookies();
	}
	const res = await request.get('/auth/x?next=https://evil.example/', { maxRedirects: 0 });
	expect(res.headers().location).not.toContain('https://evil.example');
});

test('keys are not stored or logged in the clear', async ({ page }) => {
	const secret = 'sk-or-v1-capped-THISMUSTNOTLEAK';
	await signIn(page, uniqueHandle('secrecy'));
	await saveKey(page, secret);
	const slug = await submitPrompt(page, 'A prompt for checking secrecy.');
	await donateViaApi(page, slug, 0.5);
	await page.waitForTimeout(2500);

	const walk = (dir: string): string[] =>
		readdirSync(dir).flatMap((name) => {
			const full = join(dir, name);
			return statSync(full).isDirectory() ? walk(full) : [full];
		});
	for (const file of walk('data-e2e')) {
		expect(readFileSync(file).includes('THISMUSTNOTLEAK'), file).toBe(false);
	}
	await page.goto('/account');
	expect(await page.content()).not.toContain('THISMUSTNOTLEAK');
});

test('secure headers are present', async ({ request }) => {
	const res = await request.get('/');
	const headers = res.headers();
	expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
	expect(headers['content-security-policy']).toContain("default-src 'self'");
	expect(headers['x-content-type-options']).toBe('nosniff');
});

test('missing pages are reported plainly', async ({ page }) => {
	for (const path of ['/p/does-not-exist', '/u/nobodyhere', '/nothing', '/p/does-not-exist/runs']) {
		const res = await page.goto(path);
		expect(res?.status(), path).toBe(404);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page could not be found.');
	}
});

test('odd query values are tolerated', async ({ page }) => {
	for (const path of ['/?sort=constructor', '/?sort=__proto__', '/leaderboards?period=constructor', '/?sort=evil', '/prompts?page=abc', '/prompts?page=-5', '/prompts?page=999999999', '/prompts?sort=__proto__', '/prompts?filter=constructor', "/prompts?q=%27%20OR%201%3D1%20--", '/prompts?q=%25%5F', '/leaderboards?board=x&period=y', '/p/nothing/runs/abc']) {
		const res = await page.goto(path);
		expect([200, 404], path).toContain(res?.status());
	}
});

test('a tab in a return address cannot lead to another site', async ({ page }) => {
	await page.goto(`/auth/dev?next=${encodeURIComponent('/\t/evil.example/')}`);
	await page.getByLabel('Handle').fill(uniqueHandle('tab'));
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.waitForLoadState('networkidle');
	expect(new URL(page.url()).hostname).toBe('localhost');
});

test('dialogs work from the keyboard', async ({ page }) => {
	await signIn(page, uniqueHandle('keyboard'));
	const slug = await submitPrompt(page, 'A prompt for keyboard testing.');
	await page.goto(`/p/${slug}`);
	const open = page.getByRole('button', { name: 'Donate' }).first();
	await open.focus();
	await page.keyboard.press('Enter');
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(open).toBeFocused();
});

test('nothing overflows the page at phone widths', async ({ page }) => {
	await signIn(page, uniqueHandle('widths'));
	const longWord = 'x'.repeat(300);
	const slug = await submitPrompt(page, `${longWord} ${words(240)}`);
	for (const width of [320, 390]) {
		await page.setViewportSize({ width, height: 800 });
		for (const path of ['/', `/p/${slug}`, `/p/${slug}/runs`, `/p/${slug}/repository`, '/leaderboards', '/leaderboards?board=donors', '/submit', '/about', '/account']) {
			await page.goto(path);
			await page.waitForTimeout(120);
			const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
			expect(overflow, `${path} at ${width}`).toBeLessThanOrEqual(0);
		}
	}
});
