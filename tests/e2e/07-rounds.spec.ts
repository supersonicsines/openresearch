import { expect, test, type Browser, type Page } from '@playwright/test';
import { saveKey, signIn, submitPrompt, uniqueHandle, words } from './helpers.ts';

// A round lasts fifteen seconds on the test server (ROUND_MINUTES in playwright.config.ts).
test.describe.configure({ mode: 'serial' });
test.setTimeout(150_000);

const HAIKU = 'anthropic/claude-haiku-5.5';

async function api(page: Page, method: string, path: string, body?: unknown) {
	return page.evaluate(
		async ({ method, path, body }) => {
			const res = await fetch(path, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body)
			});
			return { status: res.status, body: await res.json().catch(() => ({})) };
		},
		{ method, path, body }
	);
}

const propose = (page: Page, slug: string, question: string) =>
	api(page, 'POST', `/api/projects/${slug}/proposals`, { question });
const pledge = (page: Page, id: number, dollars: number, model = HAIKU) =>
	api(page, 'POST', `/api/proposals/${id}/pledge`, { amountMicro: Math.round(dollars * 1e6), model });

/** A second visitor, with a key, on a page of their own. */
async function visitor(browser: Browser, handle: string, key: string | null, next = '/') {
	const context = await browser.newContext();
	const page = await context.newPage();
	await signIn(page, handle, next);
	if (key) await saveKey(page, key);
	return page;
}

const row = (page: Page, question: string) => page.locator('#next .questions > li', { hasText: question });
const state = (page: Page) => page.locator('#next .state');

const first = uniqueHandle('asker');
const second = uniqueHandle('backer');
const Q1 = 'What did the schemes that weighed plate waste cost to run for each pupil?';
const Q2 = 'Which of the measures were tested in secondary schools as well as primary schools?';
let slug = '';

test('a question is proposed and backed, with OpenRouter connected on the way', async ({ page }) => {
	await signIn(page, first);
	slug = await submitPrompt(page, 'Which measures have been shown to reduce food waste in school canteens, and what did they cost?');

	await expect(state(page)).toHaveText('Round 1 opens with the first pledge');
	await expect(page.getByText('No question has been proposed as yet.')).toBeVisible();
	// The standing question is listed on every project from the start.
	await expect(row(page, 'Which claims in the findings are not supported')).toContainText('A standing question on every project');

	await page.getByRole('button', { name: 'Propose a question' }).click();
	const box = page.getByRole('textbox', { name: 'Question' });
	await box.fill(words(61));
	await expect(page.locator('#question-count')).toHaveText('61 of 60 words');
	await expect(page.getByRole('button', { name: 'Propose question' })).toBeDisabled();
	await expect(page.getByText('The question must be reduced by 1 word.')).toBeVisible();
	await box.fill(Q1);
	await page.getByRole('button', { name: 'Propose question' }).click();

	// The question is listed, and the same step moves on to backing it. No key is held as yet.
	const dialog = page.getByRole('dialog', { name: 'Back this question' });
	await expect(dialog).toContainText(Q1);
	await expect(dialog.locator('.warning')).toContainText('A spending limit should be set on this key.');
	await dialog.getByRole('link', { name: 'Connect OpenRouter' }).click();

	// OpenRouter's own page, where the key is approved. Nothing is copied.
	await page.waitForURL(/127\.0\.0\.1:\d+\/auth\?/);
	await page.locator('#approve').click();
	await page.waitForURL((url) => url.pathname === `/p/${slug}`);

	// The visitor is returned to the same dialog, and the marks that said so are gone from the address.
	await expect(dialog.getByRole('button', { name: 'Pledge $5.00' })).toBeVisible();
	await expect(dialog.getByText('$25.00 remaining on its limit')).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`/p/${slug}$`));
	await dialog.getByText('$1', { exact: true }).click();
	await dialog.getByLabel('Search models').fill('haiku');
	await dialog.getByText('Claude Haiku 5.5').click();
	await expect(dialog.getByText('Nothing is charged unless this question leads when the round closes.')).toBeVisible();
	await dialog.getByRole('button', { name: 'Pledge $1.00' }).click();

	await expect(page.getByText('A pledge of $1.00 has been recorded.')).toBeVisible();
	await expect(row(page, Q1)).toContainText('$1.00 pledged');
	await expect(row(page, Q1)).toContainText('Leading');
	await expect(row(page, Q1)).toContainText(`@${first}`);
	await expect(row(page, Q1)).toContainText('$1.00 pledged from this account.');
	await expect(state(page)).toContainText('Round 1 closes in');

	// Nothing has been charged, and nothing is in progress.
	await expect(page.locator('.rail .sum')).toHaveText('$0.00');
	await page.goto('/account');
	await expect(page.locator('.pledges li')).toContainText('Standing. Nothing is charged unless this question leads when its round closes.');
	await expect(page.getByText('No donations have been made from this account.')).toBeVisible();
});

test('the leading question is researched when the round closes, and the other pledge stands', async ({ page, browser }) => {
	await signIn(page, first, `/p/${slug}`);
	await expect(row(page, Q1)).toContainText('Leading');

	const other = await visitor(browser, second, 'sk-or-v1-capped-second');
	const listed = await propose(other, slug, Q2);
	expect(listed.status).toBe(201);
	expect((await pledge(other, listed.body.id, 2)).status).toBe(201);

	// The first visitor's page learns of it without being reloaded.
	await expect(row(page, Q2)).toContainText('$2.00 pledged');
	await expect(page.locator('#next .questions > li').first()).toContainText(Q2);
	await expect(row(page, Q2)).toContainText('Leading');
	await expect(row(page, Q1)).not.toContainText('Leading');

	// The round closes. The leading question is taken off the list and put to the model.
	await expect(state(page)).toContainText('Round 2', { timeout: 60_000 });
	await expect(row(page, Q2)).toHaveCount(0);
	await expect(page.locator('#next .last')).toContainText('Round 1 was settled');
	await expect(page.locator('#next .last')).toContainText('$2.00 from 1 backer');
	await expect(page.locator('#next .last .past')).toHaveText(Q2);

	// What was pledged towards the other question has cost nothing, and stands for the next round.
	await expect(row(page, Q1)).toContainText('$1.00 pledged');
	await expect(state(page)).toContainText('Round 2 closes in');

	await expect(async () => {
		await other.goto(`/p/${slug}/runs`);
		await expect(other.locator('ol li').last()).toContainText(Q2);
		await expect(other.locator('ol li').last()).toContainText(`proposed by @${second}`);
	}).toPass({ timeout: 60_000 });
	await other.goto('/account');
	await expect(other.locator('.donations:not(.pledges) li').first()).toContainText('Pledged towards a question that led its round.');
	await expect(other.getByText('No pledges stand on this account.')).toBeVisible();

	// The second round then goes to the question that was left, with nobody having done anything further.
	await expect(async () => {
		await page.goto(`/p/${slug}/runs`);
		await expect(page.locator('ol')).toContainText(Q1);
	}).toPass({ timeout: 90_000 });
	await page.goto(`/p/${slug}`);
	await expect(state(page)).toHaveText('Round 3 opens with the first pledge');
	await page.goto('/account');
	await expect(page.locator('.donations:not(.pledges) li').first()).toContainText('Pledged towards a question that led its round.');
	await other.context().close();
});

test('a run records who proposed its question, in the repository as on the page', async ({ page }) => {
	await page.goto(`/p/${slug}/runs`);
	await page.locator('ol li a', { hasText: Q2 }).click();
	await expect(page.locator('.facts div', { hasText: 'Proposed by' })).toContainText(`@${second}`);
	const file = await page.evaluate(async (slug) => (await fetch(`/p/${slug}/files/runs/0001.md`)).text(), slug);
	expect(file).toContain(`Question: ${Q2}`);
	expect(file).toContain(`Proposed by: @${second}`);
	expect(file).toContain(`Funded by: @${second}`);
});

test('a pledge that cannot be met is set aside before the leader is decided', async ({ page, browser }) => {
	const author = uniqueHandle('author');
	await signIn(page, author);
	const project = await submitPrompt(page, 'How often do municipal composting schemes meet the contamination limits set for them?');

	// This key has $25 left when the pledge is made, and nothing when the round closes.
	const fading = uniqueHandle('fading');
	const large = await visitor(browser, fading, 'sk-or-v1-fading-key');
	const big = await propose(large, project, 'Which schemes publish their contamination figures every month?');
	expect((await pledge(large, big.body.id, 3)).status).toBe(201);

	const small = await visitor(browser, uniqueHandle('steady'), 'sk-or-v1-capped-steady');
	const modest = await propose(small, project, 'What do the schemes do with loads that fail the limit?');
	expect((await pledge(small, modest.body.id, 0.5)).status).toBe(201);

	await page.goto(`/p/${project}`);
	await expect(page.locator('#next .questions > li').first()).toContainText('Which schemes publish');
	await expect(state(page)).toContainText('Round 2', { timeout: 60_000 });
	await expect(page.locator('#next .last .past')).toHaveText('What do the schemes do with loads that fail the limit?');
	// The question that had led is still listed, with nothing behind it.
	await expect(row(page, 'Which schemes publish')).toContainText('No pledges');

	await large.goto('/account');
	await expect(large.locator('.pledges li')).toContainText('Not met. Too little remained on the key when the round closed.');
	await expect(large.getByText('No donations have been made from this account.')).toBeVisible();
	await page.goto(`/u/${fading}`);
	await expect(page.getByText('1 pledge from this account could not be met in the last 30 days.')).toBeVisible();
	await large.context().close();
	await small.context().close();
});

test('a pledge that leads a round and then pays for nothing is counted as unmet', async ({ page, browser }) => {
	const author = uniqueHandle('author');
	await signIn(page, author);
	const project = await submitPrompt(page, 'How long do reusable nappies last when they are washed at sixty degrees?');

	// OpenRouter accepts this key when it is checked, and declines every charge made to it.
	const handle = uniqueHandle('broke');
	const empty = await visitor(browser, handle, 'sk-or-v1-broke-key');
	const listed = await propose(empty, project, 'Which fabrics were tested for more than two hundred washes?');
	expect((await pledge(empty, listed.body.id, 1)).status).toBe(201);

	await page.goto(`/p/${project}`);
	await expect(state(page)).toHaveText('Round 2 opens with the first pledge', { timeout: 60_000 });
	await expect(async () => {
		await empty.goto('/account');
		await expect(empty.locator('.donations:not(.pledges) li').first()).toContainText('Could not be completed. OpenRouter declined the charge.');
	}).toPass({ timeout: 30_000 });
	await page.goto(`/u/${handle}`);
	await expect(page.getByText('1 pledge from this account could not be met in the last 30 days.')).toBeVisible();
	await expect(page.locator('.stats')).toContainText('$0.00');
	await empty.context().close();
});

test('a pledge and a question can be withdrawn', async ({ page }) => {
	const handle = uniqueHandle('withdraw');
	await signIn(page, handle);
	await saveKey(page, 'sk-or-v1-capped-withdraw');
	const project = await submitPrompt(page, 'What is known about the lifespan of rooftop solar inverters in coastal towns?');
	const question = 'How many inverters were replaced under warranty in the first ten years?';

	const listed = await propose(page, project, question);
	expect((await pledge(page, listed.body.id, 1)).status).toBe(201);
	await page.reload();
	await expect(row(page, question)).toContainText('$1.00 pledged from this account.');
	await expect(row(page, question).getByRole('button', { name: /Change pledge/ })).toBeVisible();

	await row(page, question).getByRole('button', { name: 'Withdraw pledge' }).click();
	await expect(row(page, question)).toContainText('No pledges');
	// With nothing pledged, the round has no closing time.
	await expect(state(page)).toHaveText('Round 1 opens with the first pledge');

	await row(page, question).getByRole('button', { name: 'Withdraw question' }).click();
	await expect(row(page, question)).toHaveCount(0);
	await expect(page.getByText('No question has been proposed as yet.')).toBeVisible();
	await page.goto('/account');
	await expect(page.getByText('No pledges stand on this account.')).toBeVisible();
});

test('the rules of a round are enforced by the server, whatever the page does', async ({ page, browser }) => {
	const handle = uniqueHandle('rules');
	await signIn(page, handle);
	const project = await submitPrompt(page, 'How do tidal range schemes affect the mudflats behind them?');

	const signedOut = await (await browser.newContext()).newPage();
	await signedOut.goto(`/p/${project}`);
	expect((await propose(signedOut, project, 'A question from nobody?')).status).toBe(401);
	expect((await pledge(signedOut, 1, 1)).status).toBe(401);
	await signedOut.context().close();

	expect((await propose(page, project, words(61))).status).toBe(400);
	expect((await propose(page, project, '   ')).status).toBe(400);
	expect((await propose(page, 'no-such-project', 'A question for nothing?')).status).toBe(404);

	// A question is kept on one line, and one that is already listed is not listed twice.
	const one = await propose(page, project, 'Which  schemes\nhave been   monitored for ten years?');
	expect(one.status).toBe(201);
	const again = await propose(page, project, 'which schemes have been monitored for ten years?');
	expect(again.status).toBe(200);
	expect(again.body.id).toBe(one.body.id);
	await page.reload();
	await expect(row(page, 'Which schemes have been monitored for ten years?')).toBeVisible();

	// No key is held, so nothing can be pledged.
	const noKey = await pledge(page, one.body.id, 1);
	expect(noKey.status).toBe(400);
	expect(noKey.body.message).toBe('An OpenRouter key must be added first.');

	await saveKey(page, 'sk-or-v1-small-rules');
	expect((await pledge(page, one.body.id, 0.01)).status).toBe(400);
	const tooMuch = await pledge(page, one.body.id, 5);
	expect(tooMuch.body.message).toBe("This amount exceeds what remains on the key's spending limit.");
	expect((await pledge(page, 987654, 1)).status).toBe(404);
	expect((await pledge(page, one.body.id, 0.2, 'no/such-model')).status).toBe(400);

	// Three questions from one account on a project, and no more.
	expect((await propose(page, project, 'A second question about the mudflats?')).status).toBe(201);
	expect((await propose(page, project, 'A third question about the mudflats?')).status).toBe(201);
	const fourth = await propose(page, project, 'A fourth question about the mudflats?');
	expect(fourth.status).toBe(429);
	expect(fourth.body.message).toContain('No more than 3 questions from one account');

	// Someone else's question cannot be withdrawn.
	const stranger = await visitor(browser, uniqueHandle('stranger'), null);
	expect((await api(stranger, 'DELETE', `/api/proposals/${one.body.id}`)).status).toBe(404);
	expect((await api(stranger, 'DELETE', `/api/proposals/${one.body.id}/pledge`)).status).toBe(404);
	await stranger.context().close();
});

test('a connection that is declined says so, and a visitor is returned to the donation', async ({ page }) => {
	const handle = uniqueHandle('declines');
	await signIn(page, handle);
	const project = await submitPrompt(page, 'How accurate are household water meters after fifteen years in the ground?');

	await page.getByRole('button', { name: 'Donate' }).first().click();
	const dialog = page.getByRole('dialog', { name: 'Donate to this project' });
	await dialog.getByRole('link', { name: 'Connect OpenRouter' }).click();
	await page.waitForURL(/127\.0\.0\.1:\d+\/auth\?/);
	await page.locator('#decline').click();
	await page.waitForURL((url) => url.pathname === `/p/${project}`);
	await expect(dialog.getByText('The connection was declined on OpenRouter.')).toBeVisible();
	await expect(dialog.getByLabel('OpenRouter API key')).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`/p/${project}$`));

	// A key approved without a limit is saved, and the donation carries the warning.
	await dialog.getByRole('link', { name: 'Connect OpenRouter' }).click();
	await page.waitForURL(/127\.0\.0\.1:\d+\/auth\?/);
	await page.locator('#approve-nolimit').click();
	await page.waitForURL((url) => url.pathname === `/p/${project}`);
	await expect(dialog.getByText('This key has no spending limit.', { exact: true })).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Donate $5.00' })).toBeVisible();

	// A code that was not issued to this browser is of no use.
	await page.goto('/auth/openrouter/callback?code=capped-forged');
	await page.waitForURL((url) => url.searchParams.get('openrouter') === 'failed' || url.pathname === '/');
	await page.goto('/account');
	await expect(page.locator('.facts')).toContainText('None');
});

test('the account page connects OpenRouter as well', async ({ page }) => {
	await signIn(page, uniqueHandle('account'), '/account');
	await page.getByRole('link', { name: 'Connect OpenRouter' }).click();
	await page.waitForURL(/127\.0\.0\.1:\d+\/auth\?/);
	await page.locator('#approve').click();
	await page.waitForURL('**/account');
	await expect(page.locator('.facts')).toContainText('$25.00');
});

test('a proposed question can be removed by the operator, and its pledges are released', async ({ page, browser }) => {
	const handle = uniqueHandle('removed');
	const asker = await visitor(browser, handle, 'sk-or-v1-capped-removed');
	const project = await submitPrompt(asker, 'What share of school laptops are still in use after four years?');
	const question = 'A question that the operator would rather not keep listed?';
	const listed = await propose(asker, project, question);
	expect((await pledge(asker, listed.body.id, 1)).status).toBe(201);

	await signIn(page, 'launchadmin', '/admin');
	const entry = page.locator('.rows li', { hasText: question });
	await expect(entry).toContainText(`@${handle}`);
	await entry.getByRole('button', { name: 'Remove the question' }).click();
	await expect(page.getByText('The question has been removed from public view, and its pledges have been released.')).toBeVisible();

	await page.goto(`/p/${project}`);
	await expect(row(page, question)).toHaveCount(0);
	await expect(state(page)).toHaveText('Round 1 opens with the first pledge');
	await asker.goto('/account');
	await expect(asker.getByText('No pledges stand on this account.')).toBeVisible();
	await asker.context().close();
});

test('the round reads correctly at 390 pixels, with nothing wider than the page', async ({ page, browser }) => {
	const handle = 'a-very-long-handle-of-thirty-nine-chars';
	const long = await visitor(browser, handle, 'sk-or-v1-capped-long');
	const project = await submitPrompt(long, 'What is the failure rate of heat exchangers in district heating networks?');
	const word = 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(4);
	const listed = await propose(long, project, `${word} and its causes?`);
	expect((await pledge(long, listed.body.id, 20)).status).toBe(201);
	await long.context().close();

	await page.setViewportSize({ width: 390, height: 800 });
	await page.goto(`/p/${project}`);
	await expect(row(page, 'and its causes?')).toContainText('$20.00 pledged');
	await expect(row(page, 'and its causes?')).toContainText(`@${handle}`);
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	expect(overflow).toBeLessThanOrEqual(0);
});
