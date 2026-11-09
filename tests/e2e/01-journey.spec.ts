import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signIn, submitPrompt, uniqueHandle, words } from './helpers.ts';

test.describe.configure({ mode: 'serial' });

const PROMPT = 'How well do air-source heat pumps perform in cold, damp climates? A clear account of running costs is wanted.';
let slug = '';
const handle = uniqueHandle('journey');

test('an empty site says so plainly', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('No prompts have been submitted as yet.')).toBeVisible();
	await expect(page.locator('.ss-stage')).toBeVisible();
	await page.goto('/leaderboards');
	await expect(page.getByText('No donations have been spent in this period.')).toBeVisible();
});

test('GitHub must be connected before a prompt can be submitted, and the draft survives', async ({ page }) => {
	await page.goto('/submit');
	await page.getByLabel('Prompt').fill(PROMPT);
	await expect(page.getByRole('button', { name: 'Submit prompt' })).toHaveCount(0);
	const connect = page.getByRole('link', { name: 'Connect GitHub to submit' });
	await expect(connect).toBeVisible();
	await connect.click();
	await page.waitForURL(/\/auth\/dev/);
	await page.getByLabel('Handle').fill(handle);
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.waitForURL('**/submit');
	await expect(page.getByLabel('Prompt')).toHaveValue(PROMPT);
});

test('the prompt is limited to 250 words', async ({ page }) => {
	await signIn(page, handle, '/submit');
	const box = page.getByLabel('Prompt');
	const submit = page.getByRole('button', { name: 'Submit prompt' });

	await box.fill(words(250));
	await expect(page.locator('#count')).toHaveText('250 of 250 words');
	await expect(submit).toBeEnabled();

	await box.fill(words(251));
	await expect(page.locator('#count')).toHaveText('251 of 250 words');
	await expect(submit).toBeDisabled();
	await expect(page.getByText('The prompt must be reduced by 1 word.')).toBeVisible();

	await box.fill('');
	await expect(submit).toBeDisabled();

	// The server enforces it too, whatever the page does.
	const status = await page.evaluate(async (text) => {
		const body = new FormData();
		body.set('prompt', text);
		const res = await fetch('/submit', { method: 'POST', body, headers: { Accept: 'application/json' } });
		return (await res.json()).status;
	}, words(251));
	expect(status).toBe(400);
});

test('a prompt can be submitted, and a repository is created for it', async ({ page }) => {
	await signIn(page, handle, '/submit');
	await page.getByLabel('Prompt').fill(PROMPT);
	await page.getByRole('button', { name: 'Submit prompt' }).click();
	await page.waitForURL(/\/p\/[a-z0-9-]+/);
	slug = new URL(page.url()).pathname.split('/')[2];
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(PROMPT);
	await expect(page.getByText('No research has been funded as yet.')).toBeVisible();
	await page.goto(`/p/${slug}/repository`);
	await expect(page.getByRole('link', { name: 'PROMPT.md' })).toBeVisible();
	await page.goto('/submit');
	await expect(page.getByLabel('Prompt')).toHaveValue('');
});

test('a signed-out visitor is asked to connect GitHub before donating', async ({ page }) => {
	await page.goto(`/p/${slug}`);
	await page.getByRole('button', { name: 'Donate' }).first().click();
	await expect(page.getByText('A GitHub account must be connected before a donation can be made.')).toBeVisible();
	await expect(page.getByRole('dialog').getByRole('link', { name: 'Connect GitHub' })).toBeVisible();
});

test('the spending limit warning is obvious, and a key without a limit needs acknowledgement', async ({ page }) => {
	await signIn(page, handle, `/p/${slug}`);
	await page.getByRole('button', { name: 'Donate' }).first().click();
	const dialog = page.getByRole('dialog');

	const warning = dialog.locator('.warning');
	await expect(warning).toContainText('A spending limit should be set on this key.');
	const colours = await warning.evaluate((el) => {
		const s = getComputedStyle(el);
		return { background: s.backgroundColor, colour: s.color };
	});
	expect(colours.background).toBe('rgb(156, 28, 18)');
	expect(colours.colour).toBe('rgb(255, 255, 255)');

	const input = dialog.getByLabel('OpenRouter API key');
	const save = dialog.getByRole('button', { name: 'Save key and continue' });

	await input.fill('not-a-key');
	await save.click();
	await expect(dialog.getByText('This does not appear to be an OpenRouter key.')).toBeVisible();

	await input.fill('sk-or-v1-unknownkey123');
	await save.click();
	await expect(dialog.getByText('The key was not accepted by OpenRouter.')).toBeVisible();

	await input.fill('sk-or-v1-nolimit-abcd');
	await save.click();
	await expect(dialog.getByText('This key has no spending limit.', { exact: true })).toBeVisible();
	const confirm = dialog.getByRole('button', { name: 'Save key without a limit' });
	await expect(confirm).toBeDisabled();

	// Changing the key clears the acknowledgement, so it cannot be carried over by accident.
	await input.fill('sk-or-v1-capped-wxyz');
	await expect(confirm).toHaveCount(0);
	await dialog.getByRole('button', { name: 'Save key and continue' }).click();

	// With a key saved, the same dialog moves on to the donation.
	await expect(dialog.getByRole('button', { name: 'Donate $5.00' })).toBeVisible();
	await expect(dialog.getByText('sk-or-…wxyz')).toBeVisible();
	await expect(dialog.getByText('$25.00 remaining on its limit')).toBeVisible();
});

test('the full key is never sent back to the browser', async ({ page }) => {
	await signIn(page, handle, '/account');
	await expect(page.getByText('sk-or-…wxyz')).toBeVisible();
	const html = await page.content();
	expect(html).not.toContain('capped-wxyz');
});

test('a donation starts a live run, and the findings are published', async ({ page }) => {
	await signIn(page, handle, `/p/${slug}`);
	await page.getByRole('button', { name: 'Donate' }).first().click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('radio', { name: /Claude Sonnet 5\.5/ })).toBeChecked();

	// Amounts and models can be changed.
	await dialog.getByText('Other', { exact: true }).click();
	await dialog.getByLabel('Amount in US dollars').fill('0.05');
	await expect(dialog.getByText('An amount of at least $0.10 is required')).toBeVisible();
	await expect(dialog.getByRole('button', { name: /^Donate/ })).toBeDisabled();
	await dialog.getByLabel('Amount in US dollars').fill('30');
	await expect(dialog.getByText('This amount exceeds the $25.00 remaining')).toBeVisible();
	await dialog.getByLabel('Amount in US dollars').fill('2');

	await dialog.getByLabel('Search models').fill('haiku');
	await dialog.getByText('Claude Haiku 5.5').click();
	await dialog.getByLabel('Search models').fill('');
	await dialog.getByText('Claude Sonnet 5.5').click();

	await dialog.getByRole('button', { name: 'Donate $2.00' }).click();
	await expect(page.getByText('A donation of up to $2.00 has been recorded.')).toBeVisible();

	// The run is visible while it happens.
	const live = page.getByRole('region', { name: 'Run in progress' });
	await expect(live).toBeVisible();
	await expect(live).toContainText('Funded by @' + handle);
	await expect(live).toContainText('Run 1.');

	// When it finishes, the findings replace the live text and more runs follow.
	await expect(page.locator('.panel .prose h2').first()).toContainText('Performance in cold, damp climates', { timeout: 30_000 });
	await expect(page.getByRole('link', { name: /^Runs/ })).not.toContainText(/\b0\b/);
	await expect(page.locator('.sum')).not.toHaveText('$0.00');
});

test('the donation finishes and is recorded on the account page', async ({ page }) => {
	await signIn(page, handle, '/account');
	await expect(async () => {
		await page.reload();
		await expect(page.locator('.donations li').first()).toContainText('Finished');
	}).toPass({ timeout: 45_000 });
	const row = page.locator('.donations li').first();
	await expect(row).toContainText('Claude Sonnet 5.5');
	await expect(row).toContainText(/of \$2\.00/);
});

test('every run is committed as text and HTML, and can be cloned', async ({ page, baseURL }) => {
	await page.goto(`/p/${slug}/repository`);
	const command = await page.locator('.clone code').innerText();
	expect(command).toBe(`git clone ${baseURL}/git/${slug}.git`);

	const dir = mkdtempSync(join(tmpdir(), 'os-clone-'));
	execFileSync('git', ['clone', '--quiet', `${baseURL}/git/${slug}.git`, dir], { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
	expect(readFileSync(join(dir, 'PROMPT.md'), 'utf8').trim()).toBe(PROMPT);
	expect(existsSync(join(dir, 'findings.md'))).toBe(true);
	expect(existsSync(join(dir, 'findings.html'))).toBe(true);
	const runs = readdirSync(join(dir, 'runs'));
	expect(runs).toContain('0001.md');
	expect(runs).toContain('0001.html');
	const everything = readdirSync(dir, { recursive: true }).map(String).filter((f) => !f.startsWith('.git'));
	// Output is text and HTML only.
	for (const file of everything) {
		if (file === 'runs') continue;
		expect(file).toMatch(/\.(md|html)$/);
	}
	const body = execFileSync('git', ['log', '-1', '--format=%an%n%b', '--skip=0', '--', 'runs/0001.md'], { cwd: dir }).toString();
	expect(body).toContain(`@${handle}`);
	expect(body).toMatch(/Model: anthropic\/claude-sonnet-5\.5/);
	expect(body).toMatch(/Cost-usd: \d+\.\d+/);
});

test('text and HTML are served safely', async ({ request }) => {
	const text = await request.get(`/p/${slug}/files/findings.md`);
	expect(text.status()).toBe(200);
	expect(text.headers()['content-type']).toContain('text/plain');
	const html = await request.get(`/p/${slug}/files/findings.html`);
	expect(html.status()).toBe(200);
	expect(html.headers()['content-type']).toContain('text/html');
	expect(html.headers()['content-security-policy']).toContain('sandbox');
	expect(await html.text()).not.toMatch(/<script/i);
	const zip = await request.get(`/p/${slug}/archive.zip`);
	expect(zip.headers()['content-type']).toBe('application/zip');
});

test('the runs tab and a run page show who paid for what', async ({ page }) => {
	await page.goto(`/p/${slug}/runs`);
	const first = page.locator('.panel ol li a').last();
	await expect(first).toContainText(`@${handle}`);
	await first.click();
	await page.waitForURL(/\/runs\/1$/);
	await expect(page.locator('.facts')).toContainText('Claude Sonnet 5.5');
	await expect(page.locator('.facts')).toContainText('Funded by');
	await expect(page.getByRole('link', { name: 'text', exact: true })).toHaveAttribute('href', /runs\/0001\.md$/);
	await expect(page.getByRole('link', { name: 'HTML', exact: true })).toHaveAttribute('href', /runs\/0001\.html$/);
});

test('both leaderboards rank by the amount spent', async ({ page }) => {
	await page.goto('/leaderboards');
	const project = page.locator('.board .lead .cell');
	await expect(project).toContainText('How well do air-source heat pumps');
	await expect(project.locator('.rank')).toHaveText('1');
	await expect(project.locator('.amount')).not.toHaveText(/^\$0\.00/);

	await page.getByRole('link', { name: 'Donations' }).click();
	await page.waitForURL(/board=donors/);
	const donor = page.locator('.board .lead .cell');
	await expect(donor).toContainText(`@${handle}`);

	await page.getByRole('link', { name: '7 days' }).click();
	await page.waitForURL(/period=7/);
	await expect(page.locator('.board .lead .cell')).toContainText(`@${handle}`);
});

test('the projects are ranked on a board only when sorted by funding', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('.board .lead .rank')).toHaveText('1');
	const count = await page.locator('.board .slot:not(.closing)').count();
	const closing = page.locator('.board .closing');
	await expect(closing).toContainText('This place is vacant.');
	await expect(closing.locator('.rank')).toHaveText(String(count + 1));
	await expect(closing.locator('a')).toHaveAttribute('href', '/submit');

	await page.getByRole('link', { name: 'Newest' }).click();
	await page.waitForURL(/sort=recent/);
	await expect(page.locator('.board .rank')).toHaveCount(0);
	await expect(page.locator('.board .lead')).toHaveCount(0);
	await expect(page.locator('.board .note').first()).toContainText('Submitted');
	await expect(closing).toContainText('A further prompt may be submitted.');
});

test('the tabs change the board without moving the page', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 420 });
	await page.goto('/');
	await page.evaluate(() => window.scrollTo(0, 180));
	await page.getByRole('link', { name: 'Newest' }).click();
	await page.waitForURL(/sort=recent/);
	await expect(page.locator('.board .rank')).toHaveCount(0);
	expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
	// The underline follows the tab, to within the rounding of its measurements.
	await expect
		.poll(() =>
			page.evaluate(() => {
				const link = document.querySelector('.tabs a[aria-current="page"]')!.getBoundingClientRect();
				const bar = document.querySelector('.tabs .bar')!.getBoundingClientRect();
				return Math.abs(link.left - bar.left) + Math.abs(link.width - bar.width);
			})
		)
		.toBeLessThan(2);
});

test('cells slide to their new places, unless reduced motion is preferred', async ({ page }) => {
	// A newer prompt with no funding is first by date and last by funding, so that the order changes.
	await signIn(page, handle);
	await submitPrompt(page, 'What has been learned from trials of later school start times?');
	const slides = async () => {
		await page.goto('/');
		await page.evaluate(() => {
			const w = window as unknown as { slides: number };
			w.slides = 0;
			const original = Element.prototype.animate;
			Element.prototype.animate = function (...args) {
				if ((this as Element).matches('[data-key]')) w.slides++;
				return original.apply(this, args);
			};
		});
		await page.getByRole('link', { name: 'Newest' }).click();
		await page.waitForURL(/sort=recent/);
		await expect(page.locator('.board .rank')).toHaveCount(0);
		return page.evaluate(() => (window as unknown as { slides: number }).slides);
	};
	expect(await slides()).toBeGreaterThan(0);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	expect(await slides()).toBe(0);
});

test('cards can be generated and carry the right links', async ({ page, baseURL }) => {
	await page.goto(`/p/${slug}`);
	await page.getByRole('button', { name: 'Generate a card' }).click();
	const dialog = page.getByRole('dialog', { name: 'Share this project' });
	const image = dialog.locator('img');
	await expect(image).toBeVisible();
	await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1200);

	const post = await dialog.getByRole('link', { name: 'Post on X' }).getAttribute('href');
	const url = new URL(post!);
	expect(url.origin + url.pathname).toBe('https://x.com/intent/tweet');
	expect(url.searchParams.get('url')).toBe(`${baseURL}/p/${slug}`);
	// These are GitHub handles. On X the same name may belong to someone else.
	expect(url.searchParams.get('text')).not.toContain('@');

	await expect(dialog.getByRole('link', { name: 'Download image' })).toHaveAttribute('download', /\.png$/);

	// Posting the link shows the card on X, through these tags.
	const meta = await page.locator('meta[name="twitter:card"]').getAttribute('content');
	expect(meta).toBe('summary_large_image');
	const image2 = await page.locator('meta[property="og:image"]').getAttribute('content');
	expect(image2).toBe(`${baseURL}/card/project/${slug}.png`);
});

test('all three kinds of card are valid images', async ({ request, page }) => {
	const png = [0x89, 0x50, 0x4e, 0x47];
	const check = async (path: string) => {
		const res = await request.get(path);
		expect(res.status(), path).toBe(200);
		expect(res.headers()['content-type']).toBe('image/png');
		expect([...(await res.body()).subarray(0, 4)]).toEqual(png);
	};
	await check(`/card/project/${slug}.png`);
	await check(`/card/donor/${handle}.png`);
	await page.goto('/');
	expect((await request.get('/card/project/does-not-exist.png')).status()).toBe(404);
});

test('a profile lists what has been funded', async ({ page }) => {
	await page.goto(`/u/${handle}`);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(`@${handle}`);
	await expect(page.locator('.stats')).toContainText('Donated');
	await expect(page.getByRole('link', { name: /How well do air-source heat pumps/ }).first()).toBeVisible();
});

test('a key can be removed from the account page', async ({ page }) => {
	await signIn(page, handle, '/account');
	await expect(page.getByText('sk-or-…wxyz')).toBeVisible();
	await page.getByRole('button', { name: 'Remove key' }).click();
	const confirm = page.getByRole('dialog', { name: 'Remove this key' });
	await expect(confirm).toBeVisible();
	await confirm.getByRole('button', { name: 'Keep key' }).click();
	await expect(confirm).toBeHidden();
	await expect(page.getByText('sk-or-…wxyz')).toBeVisible();
	await page.getByRole('main').getByRole('button', { name: 'Remove key' }).click();
	await confirm.getByRole('button', { name: 'Remove key' }).click();
	await expect(page.getByText('sk-or-…wxyz')).toHaveCount(0);
	await expect(page.locator('.warning')).toContainText('A spending limit should be set');
});

test('signing out ends the session', async ({ page }) => {
	await signIn(page, handle, '/account');
	await page.getByRole('button', { name: 'Sign out' }).click();
	await page.waitForURL('/');
	await expect(page.getByRole('link', { name: 'Connect GitHub' }).first()).toBeVisible();
	await page.goto('/account');
	await page.waitForURL(/\/auth\/dev/);
});
