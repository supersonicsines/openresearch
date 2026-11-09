// What a public launch depends on: the full list, visible identities, live updates, and takedowns.
import { expect, test, type Browser } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { donateViaApi, saveKey, signIn, submitPrompt, uniqueHandle } from './helpers.ts';

const exec = promisify(execFile);

async function asUser(browser: Browser, handle: string) {
	const context = await browser.newContext({ baseURL: 'http://localhost:4173' });
	const page = await context.newPage();
	await signIn(page, handle);
	return { context, page };
}

test('every prompt can be found on the full list, with the newest first', async ({ page }) => {
	const handle = uniqueHandle('lister');
	await signIn(page, handle);
	const marker = `zebrafish${Date.now()}`;
	const first = await submitPrompt(page, `What is known about ${marker} sleep patterns in captivity?`);
	const second = await submitPrompt(page, `How have ${marker} been used in the study of regeneration?`);

	await page.goto('/');
	await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'All prompts' }).click();
	await page.waitForURL('/prompts');
	const rows = page.locator('tbody tr');
	await expect(rows.first()).toContainText('regeneration');
	await expect(rows.nth(1)).toContainText('sleep patterns');
	await expect(rows.first()).toContainText(`@${handle}`);
	await expect(rows.first().locator('.c-ref')).toHaveText(/^OR-\d{4,}$/);

	// A search keeps its place in the address, so that it can be shared or reloaded.
	await page.getByLabel('Search prompts or handles').fill(marker);
	await page.getByLabel('Search prompts or handles').press('Enter');
	await page.waitForURL(new RegExp(`q=${marker}`));
	await expect(rows).toHaveCount(2);
	await page.reload();
	await expect(rows).toHaveCount(2);

	// Whoever submitted a prompt can be searched for as well.
	await page.goto(`/prompts?q=${handle}`);
	await expect(rows).toHaveCount(2);

	await page.goto(`/prompts?q=${marker}&filter=funded`);
	await expect(page.getByText('No prompts are listed under this filter.').or(page.getByText('No prompts match this search.'))).toBeVisible();

	await page.goto(`/prompts?q=${marker}&filter=unfunded`);
	await expect(rows).toHaveCount(2);

	// Characters with a special meaning to the database are treated as plain text.
	await page.goto('/prompts?q=%25');
	await expect(page.getByRole('heading', { name: 'All prompts' })).toBeVisible();

	await page.goto(`/p/${first}`);
	await page.goto(`/p/${second}`);
});

test('a page number that makes no sense still shows a page', async ({ page }) => {
	for (const value of ['99999', 'Infinity', '-Infinity', 'NaN', '1e400', '0.5']) {
		const res = await page.goto(`/prompts?page=${value}`);
		expect(res?.status(), value).toBe(200);
		await expect(page.getByRole('heading', { name: 'All prompts' })).toBeVisible();
	}
});

test('the board is a sample, and leads on to the full list', async ({ page, browser }) => {
	const { context, page: other } = await asUser(browser, uniqueHandle('many'));
	for (let i = 0; i < 16; i++) await submitPrompt(other, `Filler prompt number ${i} about the migration of arctic terns?`);
	await context.close();
	await page.goto('/');
	await expect(page.locator('.board .slot:not(.closing)')).toHaveCount(14);
	const closing = page.locator('.board .closing');
	await expect(closing).toContainText(/See all \d+ prompts/);
	await closing.getByRole('link').click();
	await page.waitForURL(/\/prompts/);
	await expect.poll(() => page.locator('tbody tr').count()).toBeGreaterThan(14);
});

test('the @handle is shown on the board, the project, and in the header', async ({ page }) => {
	const handle = uniqueHandle('visible');
	await signIn(page, handle);
	await expect(page.getByRole('link', { name: `Account: @${handle}` })).toContainText(`@${handle}`);
	const slug = await submitPrompt(page, 'Which species of tern travels the furthest in a single year?');

	await expect(page.locator('.by').getByRole('link', { name: `@${handle}`, exact: true })).toBeVisible();
	await expect(page.locator('.by .ref')).toHaveText(/^OR-\d+/);

	await page.goto('/?sort=recent');
	const cell = page.locator('.board .slot').first();
	const link = cell.getByRole('link', { name: `@${handle}` });
	await expect(link).toBeVisible();
	await link.click();
	await page.waitForURL(`/u/${handle}`);
	await expect(page.getByRole('heading', { name: `@${handle}` })).toBeVisible();

	// The rest of the cell leads to the project, not to the account.
	await page.goto('/?sort=recent');
	const meter = await page.locator('.board .slot').first().locator('.meter').boundingBox();
	await page.mouse.click(meter!.x + meter!.width / 2, meter!.y + meter!.height / 2);
	await page.waitForURL(`/p/${slug}`);
});

test('recent activity is shown, can be paused, and leads to the project', async ({ page }) => {
	const handle = uniqueHandle('ticker');
	await signIn(page, handle);
	const slug = await submitPrompt(page, 'What limits the lifespan of a lithium-sulphur battery cell?');
	await page.goto('/');
	const ticker = page.getByRole('region', { name: 'Recent activity' });
	await expect(ticker).toContainText(`@${handle}`);
	const pause = ticker.getByRole('button', { name: 'Pause the activity feed' });
	await pause.click();
	const state = await ticker.locator('.belt').evaluate((el) => getComputedStyle(el).animationPlayState);
	expect(state).toBe('paused');
	await ticker.getByRole('link').first().click();
	await page.waitForURL(`/p/${slug}`);
});

test('an open board updates by itself when something happens', async ({ page, browser }) => {
	await page.goto('/?sort=recent');
	const marker = `kittiwake${Date.now()}`;
	const { context, page: other } = await asUser(browser, uniqueHandle('live'));
	await submitPrompt(other, `How has the ${marker} population changed along the North Sea coast?`);
	await context.close();
	await expect(page.locator('.board')).toContainText(marker, { timeout: 15_000 });
});

test('amounts are raised, milestones are shown, and pledges are distinguished', async ({ page }) => {
	await signIn(page, uniqueHandle('meter'));
	await saveKey(page, 'sk-or-v1-capped-meter');
	const slug = await submitPrompt(page, 'How well do heat pumps work? A prompt for the meter.');
	await expect(page.locator('.funding .to')).toHaveText('of the $1 milestone');
	await expect(page.locator('.funding .meter')).toHaveAttribute('aria-label', '$0.00 of the $1 milestone');

	await donateViaApi(page, slug, 1);
	await page.reload();
	await expect(page.locator('.funding')).toContainText(/pledged|raised/);
	await expect(page.locator('.sum')).not.toHaveText('$0.00', { timeout: 30_000 });
});

test('models that cannot be budgeted for are not offered', async ({ page }) => {
	await signIn(page, uniqueHandle('models'));
	const models = await page.evaluate(async () => (await (await fetch('/api/models')).json()).models.map((m: { id: string }) => m.id));
	expect(models).toContain('anthropic/claude-sonnet-5.5');
	expect(models).not.toContain('short/short-replies');
	expect(models).not.toContain('nolimit/no-token-parameter');
});

test('a donation too small for the model is refused before anything is spent', async ({ page }) => {
	await signIn(page, uniqueHandle('minimum'));
	await saveKey(page, 'sk-or-v1-capped-minimum');
	const slug = await submitPrompt(page, 'How well do heat pumps work? A prompt for the minimum.');
	const small = await donateViaApi(page, slug, 0.1, 'anthropic/claude-opus-5.5');
	expect(small.status).toBe(400);
	expect(small.body.message).toMatch(/at least \$0\.1\d/);
	const fine = await donateViaApi(page, slug, 0.1, 'anthropic/claude-haiku-5.5');
	expect(fine.status).toBe(201);
});

test('one account cannot occupy all of the research at once', async ({ page }) => {
	await signIn(page, uniqueHandle('slots'));
	await saveKey(page, 'sk-or-v1-capped-slots');
	const results = [];
	for (let i = 0; i < 4; i++) {
		const slug = await submitPrompt(page, `How well do heat pumps work? A prompt for slot number ${i}.`);
		results.push(await donateViaApi(page, slug, 0.5, 'anthropic/claude-haiku-5.5'));
	}
	expect(results.slice(0, 3).map((r) => r.status)).toEqual([201, 201, 201]);
	expect(results[3].status).toBe(429);
	expect(results[3].body.message).toContain('No more than 3 donations');
});

test('a charge held back by OpenRouter is retried, not treated as an empty key', async ({ page }) => {
	await signIn(page, uniqueHandle('held'));
	await saveKey(page, `sk-or-v1-held-${Date.now()}`);
	const slug = await submitPrompt(page, 'How well do heat pumps work? A prompt for held charges.');
	await donateViaApi(page, slug, 0.5);
	await expect(async () => {
		await page.goto(`/p/${slug}/runs`);
		await expect(page.locator('main ol li').first()).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 45_000 });
	await page.goto('/account');
	await expect(page.locator('.donations li').first()).not.toContainText('declined the charge');
});

test('a report stopped at its length limit is marked as incomplete', async ({ page }) => {
	await signIn(page, uniqueHandle('length'));
	await saveKey(page, 'sk-or-v1-length-test');
	const slug = await submitPrompt(page, 'How well do heat pumps work? A prompt for length.');
	await donateViaApi(page, slug, 0.5);
	await page.goto(`/p/${slug}/runs/1`);
	await expect(async () => {
		await page.goto(`/p/${slug}/runs/1`);
		await expect(page.getByText('reached the length allowed for one run')).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 30_000 });
});

test('a report reaches the operator, and removal takes a project out of everything', async ({ page, browser }) => {
	test.setTimeout(120_000);
	const author = uniqueHandle('removed');
	await signIn(page, author);
	await saveKey(page, 'sk-or-v1-capped-removal');
	const marker = `removable${Date.now()}`;
	const slug = await submitPrompt(page, `What is the ${marker} made of, and how well do heat pumps work?`);
	await donateViaApi(page, slug, 0.5);
	await expect(async () => {
		await page.goto(`/p/${slug}/runs`);
		await expect(page.locator('main ol li').first()).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 30_000 });

	// Anyone can report, signed in or not.
	const visitor = await browser.newContext({ baseURL: 'http://localhost:4173' });
	const anon = await visitor.newPage();
	await anon.goto(`/p/${slug}`);
	await anon.getByRole('button', { name: 'Report this project' }).click();
	await anon.getByLabel('Reason').fill(`This names a private person (${marker}).`);
	await anon.getByRole('button', { name: 'Send report' }).click();
	await expect(anon.getByText('The report has been received')).toBeVisible();

	// The page does not admit to existing for anyone else.
	expect((await anon.goto('/admin'))?.status()).toBe(404);
	expect((await page.goto('/admin'))?.status()).toBe(404);
	const forged = await page.evaluate(async (s) => {
		const body = new URLSearchParams({ slug: s });
		const res = await fetch('/admin?/hide', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-sveltekit-action': 'true' },
			body
		});
		return (await res.json()).status ?? res.status;
	}, slug);
	expect(forged).toBe(404);

	const admin = await asUser(browser, 'launchadmin');
	await admin.page.goto('/admin');
	const report = admin.page.locator('section', { hasText: 'Open reports' }).locator('li', { hasText: marker });
	await expect(report).toBeVisible();
	await report.getByRole('button', { name: 'Remove the project' }).click();
	await expect(admin.page.getByText('The project has been removed from public view.')).toBeVisible();
	await expect(admin.page.locator('section', { hasText: 'Open reports' }).locator('li', { hasText: marker })).toHaveCount(0);

	// Gone from every public route, and a clone no longer works.
	expect((await anon.goto(`/p/${slug}`))?.status()).toBe(410);
	await expect(anon.getByText('has been removed by the operator')).toBeVisible();
	for (const path of [`/p/${slug}/runs`, `/p/${slug}/files/findings.md`, `/p/${slug}/archive.zip`, `/git/${slug}.git/HEAD`, `/git/${slug}.git/info/refs`, `/p/${slug}/events`, `/card/project/${slug}.png`]) {
		const res = await anon.request.get(path);
		expect([404, 410], path).toContain(res.status());
	}
	await anon.goto(`/prompts?q=${marker}`);
	await expect(anon.locator('tbody tr')).toHaveCount(0);
	await anon.goto('/leaderboards');
	await expect(anon.locator('body')).not.toContainText(marker);
	const dir = mkdtempSync(join(tmpdir(), 'clone-'));
	await expect(exec('git', ['clone', '--quiet', `http://localhost:4173/git/${slug}.git`, join(dir, 'c')], { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })).rejects.toThrow();
	rmSync(dir, { recursive: true, force: true });

	// Nor can anything further be donated to it, and its title is gone from the donor's account.
	const refused = await donateViaApi(page, slug, 0.5);
	expect(refused.status).toBe(404);
	await page.goto('/account');
	await expect(page.locator('main')).not.toContainText(marker);
	await expect(page.locator('main')).toContainText('A project that has been removed');

	// It can be restored, because nothing was deleted.
	const row = admin.page.locator('section', { hasText: 'Prompts' }).locator('li', { hasText: marker });
	await row.getByRole('button', { name: 'Restore', exact: true }).click();
	await expect(admin.page.getByText('The project has been restored.')).toBeVisible();
	expect((await anon.goto(`/p/${slug}`))?.status()).toBe(200);

	// Deletion removes the text and the repository for good.
	await row.getByRole('checkbox', { name: 'Permanently' }).check();
	await row.getByRole('button', { name: 'Delete text and repository' }).click();
	await expect(admin.page.getByText('The text and repository of the project have been deleted.')).toBeVisible();
	await expect(admin.page.locator('body')).not.toContainText(marker);
	expect((await anon.goto(`/p/${slug}`))?.status()).toBe(410);

	await visitor.close();
	await admin.context.close();
});

test('a suspended account loses access at once, and its work stops', async ({ browser }) => {
	test.setTimeout(90_000);
	const handle = uniqueHandle('suspended');
	const user = await asUser(browser, handle);
	await saveKey(user.page, 'sk-or-v1-capped-suspended');
	const marker = `suspendable${Date.now()}`;
	const slug = await submitPrompt(user.page, `What is the ${marker}, and how well do heat pumps work?`);

	const admin = await asUser(browser, 'launchadmin');
	await admin.page.goto('/admin');
	const row = admin.page.locator('li', { hasText: marker });
	await row.getByRole('checkbox', { name: 'And remove their prompts' }).check();
	await row.getByRole('button', { name: `Suspend @${handle}` }).click();
	await expect(admin.page.getByText(`@${handle} has been suspended.`)).toBeVisible();

	// Signed out, unable to act, and with no public page.
	await user.page.goto('/');
	await expect(user.page.getByRole('link', { name: `Account: @${handle}` })).toHaveCount(0);
	expect((await user.page.goto(`/u/${handle}`))?.status()).toBe(404);
	expect((await user.page.goto(`/p/${slug}`))?.status()).toBe(410);

	// The operator's own account cannot be suspended by accident.
	const self = await admin.page.evaluate(async () => {
		const res = await fetch('/admin?/suspend', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-sveltekit-action': 'true' },
			body: new URLSearchParams({ handle: 'launchadmin' })
		});
		return (await res.json()).status;
	});
	expect(self).toBe(400);

	await user.context.close();
	await admin.context.close();
});

test('on a phone, a project can be reported and its donors can be seen', async ({ page }) => {
	const handle = uniqueHandle('phone');
	await signIn(page, handle);
	await saveKey(page, 'sk-or-v1-capped-phone');
	const slug = await submitPrompt(page, 'How well do heat pumps work? A prompt for a phone.');
	await donateViaApi(page, slug, 0.5);
	await page.setViewportSize({ width: 390, height: 800 });
	await expect(async () => {
		await page.goto(`/p/${slug}`);
		await expect(page.locator('.below').getByRole('link', { name: `@${handle}` })).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Report this project' }).click();
	await expect(page.getByRole('dialog', { name: 'Report this project' })).toBeVisible();
	await page.keyboard.press('Escape');
	await page.setViewportSize({ width: 1280, height: 800 });
	await expect(page.getByRole('button', { name: 'Report this project' })).toHaveCount(1);
	await expect(page.locator('.rail').getByRole('button', { name: 'Report this project' })).toBeVisible();
});

test('text typed while the page is still loading is not lost', async ({ page }) => {
	await signIn(page, uniqueHandle('slowtyper'));
	// The page arrives at once, but its script takes a moment, as it would on a slow connection.
	await page.route('**/_app/immutable/**', async (route) => {
		await new Promise((r) => setTimeout(r, 700));
		await route.continue();
	});
	await page.goto('/submit', { waitUntil: 'commit' });
	const box = page.getByLabel('Prompt');
	await box.fill('Typed before the page had finished loading.');
	await page.waitForLoadState('load');
	await page.waitForTimeout(1500);
	await expect(box).toHaveValue('Typed before the page had finished loading.');
});

test('one very long word cannot widen any page', async ({ page }) => {
	const handle = uniqueHandle('longword');
	await signIn(page, handle);
	await saveKey(page, 'sk-or-v1-capped-longword');
	const slug = await submitPrompt(page, `Is ${'x'.repeat(1200)} a word, and how well do heat pumps work?`);
	await donateViaApi(page, slug, 0.5);
	await expect(async () => {
		await page.goto(`/p/${slug}/runs`);
		await expect(page.locator('main ol li').first()).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 30_000 });
	for (const width of [1280, 768, 390, 320]) {
		await page.setViewportSize({ width, height: 800 });
		for (const path of [`/p/${slug}`, `/p/${slug}/runs`, `/p/${slug}/runs/1`, `/p/${slug}/repository`, `/u/${handle}`, '/account', '/?sort=recent', `/prompts?q=${handle}`]) {
			await page.goto(path);
			const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
			expect(overflow, `${path} at ${width}`).toBeLessThanOrEqual(0);
		}
	}
});

test('the widest possible handle fits on every page at every width', async ({ page }) => {
	const handle = 'WWWWWWWWWWWWWWW';
	await signIn(page, handle);
	const slug = await submitPrompt(page, 'How well do heat pumps work? A prompt from the widest possible handle.');
	for (const width of [1280, 921, 920, 768, 480, 390, 360, 320]) {
		await page.setViewportSize({ width, height: 800 });
		for (const path of ['/', '/account', `/u/${handle}`, `/p/${slug}`, `/p/${slug}/repository`, '/prompts', '/submit']) {
			await page.goto(path);
			const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
			expect(overflow, `${path} at ${width}`).toBeLessThanOrEqual(0);
		}
	}
});

test('signed in with the longest handle and admin access, the header fits at every width', async ({ page }) => {
	await signIn(page, 'launchadmin');
	await page.goto('/');
	for (const width of [1280, 1024, 960, 921, 920, 900, 860, 768, 721, 720, 600, 480, 390, 360, 320]) {
		await page.setViewportSize({ width, height: 700 });
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		expect(overflow, `at ${width}`).toBeLessThanOrEqual(0);
	}
});

test('the keyboard reaches the board without passing through the activity feed', async ({ page, browser }) => {
	const { context, page: other } = await asUser(browser, uniqueHandle('tabbing'));
	await submitPrompt(other, 'A prompt, so that the board has at least one cell on it to reach by keyboard?');
	await context.close();
	await page.goto('/?sort=recent');
	let reached = 0;
	for (let i = 1; i <= 20 && !reached; i++) {
		await page.keyboard.press('Tab');
		expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.belt')))).toBe(false);
		if (await page.evaluate(() => Boolean(document.activeElement?.closest('.board')))) reached = i;
	}
	expect(reached).toBeGreaterThan(0);
});

test('the submit button reads correctly at both widths', async ({ page }) => {
	await page.goto('/');
	const button = page.locator('header.site .submit');
	await expect(button).toHaveText('Submit a prompt');
	await page.setViewportSize({ width: 390, height: 800 });
	expect((await button.innerText()).trim()).toBe('Submit');
});

test('the site can be monitored, shared and read', async ({ page, request }) => {
	expect(await (await request.get('/healthz')).json()).toEqual({ ok: true });

	const home = await request.get('/');
	const html = await home.text();
	expect(html).toContain('property="og:image"');
	expect(html).toContain('/card/site.png');
	expect(home.headers()['content-security-policy']).toContain("default-src 'self'");
	expect(home.headers()['x-content-type-options']).toBe('nosniff');

	const card = await request.get('/card/site.png');
	expect(card.status()).toBe(200);
	expect(card.headers()['content-type']).toBe('image/png');

	await page.goto('/');
	await page.getByRole('navigation', { name: 'Site information' }).getByRole('link', { name: 'Terms' }).click();
	await expect(page.getByRole('heading', { name: 'Terms' })).toBeVisible();
	await page.getByRole('navigation', { name: 'Site information' }).getByRole('link', { name: 'Privacy' }).click();
	await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible();
});

test('cards survive what people actually type', async ({ page, request }) => {
	await signIn(page, uniqueHandle('cards'));
	for (const prompt of [
		'日本語の質問です。 これは機能しますか?',
		'🧪🔬🧬 emoji only ✨ ok?',
		'مرحبا بالعالم، هل هذا يعمل؟',
		`A very long unbroken word: ${'x'.repeat(900)}`,
		'<script>alert(1)</script> & "quotes" \'single\' {{ braces }}',
		'Ελληνικά και кириллица and français?'
	]) {
		const slug = await submitPrompt(page, prompt);
		const res = await request.get(`/card/project/${slug}.png`);
		expect(res.status(), prompt).toBe(200);
		expect(res.headers()['content-type']).toBe('image/png');
	}
});
