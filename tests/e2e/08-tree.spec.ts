import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { donateViaApi, saveKey, signIn, submitPrompt, uniqueHandle } from './helpers.ts';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const handle = uniqueHandle('tree');
let slug = '';

/** Waits until every donation on the account has finished, so that the runs are all in place. */
async function finished(page: Page) {
	await expect(async () => {
		await page.goto('/account');
		await expect(page.locator('.donations:not(.pledges) li').first()).toContainText('Finished');
	}).toPass({ timeout: 60_000 });
}

test('findings are set out in sections that open and close', async ({ page }) => {
	await signIn(page, handle);
	await saveKey(page, 'sk-or-v1-capped-tree');
	slug = await submitPrompt(page, 'How well do heat pumps perform in older homes? A prompt for the tree.');
	expect((await donateViaApi(page, slug, 2)).status).toBe(201);
	await finished(page);

	await page.goto(`/p/${slug}`);
	// The answer as it stands is always shown, and each section is closed until it is opened.
	await expect(page.locator('.findings > p').first()).toContainText('The evidence gathered so far');
	const first = page.locator('details.section').first();
	await expect(first.locator('summary h2')).toContainText('Performance in cold, damp climates');
	await expect(first.locator('summary .count')).toHaveText('2 sources');
	await expect(first.locator('.section-body')).toBeHidden();
	await expect(page.getByText('3 sections, 0 open.')).toBeVisible();

	await first.locator('summary').click();
	await expect(first.locator('.section-body')).toContainText('Field trials in the United Kingdom');
	await expect(page.getByText('3 sections, 1 open.')).toBeVisible();

	await page.getByRole('button', { name: 'Open all' }).click();
	await expect(page.locator('details.section[open]')).toHaveCount(3);
	await page.getByRole('button', { name: 'Close all' }).click();
	await expect(page.locator('details.section[open]')).toHaveCount(0);

	// The keyboard opens a section, and a link to one opens it.
	await first.locator('summary').focus();
	await page.keyboard.press('Enter');
	await expect(first).toHaveAttribute('open', '');
	await page.goto(`/p/${slug}#section-2`);
	await expect(page.locator('#section-2')).toHaveAttribute('open', '');
});

test('the findings in the repository are in the same sections, without any script', async ({ page }) => {
	await page.goto(`/p/${slug}`);
	const html = await page.evaluate(async (s) => (await fetch(`/p/${s}/files/findings.html`)).text(), slug);
	expect(html.match(/<details class="section"/g)?.length).toBe(3);
	expect(html).not.toContain('<script');
	const md = await page.evaluate(async (s) => (await fetch(`/p/${s}/files/findings.md`)).text(), slug);
	expect(md).toContain('## Performance in cold, damp climates');
});

test('the tree shows every question beneath the run that raised it', async ({ page }) => {
	await page.goto(`/p/${slug}`);
	await page.getByRole('link', { name: 'Tree', exact: true }).click();
	await page.waitForURL(`**/p/${slug}/tree`);
	await expect(page.getByRole('heading', { name: 'Research tree' })).toBeVisible();

	const tree = page.locator('ul.tree');
	const root = tree.locator('> li').first();
	await expect(root.locator('> .row')).toContainText('Run 1');
	await expect(root.locator('> .row')).toContainText('The prompt itself');
	await expect(root.locator('> .row')).toContainText('Performance in cold, damp climates');
	await expect(root.locator('> .row')).toContainText(`@${handle}`);

	// The questions that the first run's edit listed hang from it, and were researched in turn.
	const second = root.locator('> ul > li', { hasText: 'How do installation standards differ' });
	await expect(second.locator('> .row')).toContainText('Run 2');
	await expect(second.locator('> .row')).toContainText('Listed by the editor after run 1');
	await expect(page.locator('.stats-strip')).toContainText('researched');
	const researched = Number(await page.locator('.stats-strip div', { hasText: 'researched' }).locator('dd').innerText());
	expect(researched).toBeGreaterThanOrEqual(3);

	// A branch can be folded away, and says what is beneath it.
	const fold = root.locator('> .row').getByRole('button', { name: /beneath/ });
	await expect(fold).toContainText('across');
	await fold.click();
	await expect(root.locator('> ul')).toHaveCount(0);
	await fold.click();
	await expect(root.locator('> ul')).toHaveCount(1);
});

test('the tree can be seen as it stood after any run', async ({ page }) => {
	await page.goto(`/p/${slug}/tree`);
	const status = page.locator('.time [role=status]');
	await expect(status).toContainText(/After run \d+ of \d+/);
	const total = Number((await status.innerText()).match(/of (\d+)/)![1]);

	// One run back at a time, to the beginning.
	for (let i = total; i > 1; i--) await page.getByRole('button', { name: 'One run earlier' }).click();
	await expect(status).toContainText(`After run 1 of ${total}`);
	const root = page.locator('ul.tree > li').first();
	// After the first run, what it raised had not yet been researched.
	const second = root.locator('> ul > li', { hasText: 'How do installation standards differ' });
	await expect(second.locator('> .row .tag')).toHaveText('Open');
	await expect(second.locator('> .row')).not.toContainText('Run 2');
	await expect(page.locator('.stats-strip div', { hasText: 'researched' }).locator('dd')).toHaveText('1');

	await page.getByRole('button', { name: 'One run earlier' }).click();
	await expect(status).toHaveText('Before the first run');
	await expect(page.locator('ul.tree > li')).toHaveCount(1);
	await expect(page.locator('ul.tree > li .tag')).toHaveText('Open');
	await expect(page.getByRole('button', { name: 'One run earlier' })).toBeDisabled();

	// The slider answers to the keyboard, and the present can be returned to.
	await page.getByLabel('The tree as it stood').focus();
	await page.keyboard.press('ArrowRight');
	await expect(status).toContainText(`After run 1 of ${total}`);
	await page.getByRole('button', { name: 'Return to the present' }).click();
	await expect(status).toContainText(`After run ${total} of ${total}`);
	await expect(page.getByRole('button', { name: 'Return to the present' })).toHaveCount(0);
});

test('a run names the run that raised its question, on its page and in its commit', async ({ page }) => {
	await page.goto(`/p/${slug}/runs/2`);
	await expect(page.locator('.facts div', { hasText: 'Raised by' })).toContainText('Run 1');
	const file = await page.evaluate(async (s) => (await fetch(`/p/${s}/files/runs/0002.md`)).text(), slug);
	expect(file).toContain('Raised by: Run 1');

	const origin = new URL(page.url()).origin;
	const dir = mkdtempSync(join(tmpdir(), 'os-tree-'));
	execFileSync('git', ['clone', '--quiet', `${origin}/git/${slug}.git`, dir], { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
	const body = execFileSync('git', ['log', '-1', '--format=%b', '--', 'runs/0002.md'], { cwd: dir }).toString();
	expect(body).toContain('Raised-by: run 1');
});

test('a question in the tree can be proposed for the round from where it stands', async ({ page, browser }) => {
	// A second prompt, with one run, so that questions are left open.
	await signIn(page, handle);
	const project = await submitPrompt(page, 'How has water quality changed in English rivers? A prompt with open questions.');
	// Enough for one run of this model and no more, so that what the run raises is still open.
	expect((await donateViaApi(page, project, 0.14, 'anthropic/claude-opus-5.5')).status).toBe(201);
	await finished(page);

	await page.goto(`/p/${project}/tree`);
	const open = page.locator('ul.tree li.open').first();
	await expect(open.locator('.tag')).toHaveText('Open');
	const question = (await open.locator('.asked').innerText()).trim();

	await page.getByRole('button', { name: 'Open only' }).click();
	// The way to an open question is still shown.
	await expect(page.locator('ul.tree > li').first()).toContainText('Run 1');
	await expect(page.locator('ul.tree li.open').first()).toBeVisible();

	await open.getByRole('link', { name: 'Propose' }).click();
	await page.waitForURL((url) => url.pathname === `/p/${project}`);
	const dialog = page.getByRole('dialog', { name: 'Propose a question' });
	await expect(dialog.getByRole('textbox', { name: 'Question' })).toHaveValue(question);
	await expect(page).toHaveURL(new RegExp(`/p/${project}$`));
	await dialog.getByRole('button', { name: 'Propose question' }).click();
	await expect(page.getByRole('dialog', { name: 'Back this question' })).toContainText(question);
	await page.keyboard.press('Escape');

	// It is then in the tree as a question in a round, beneath the run it was put to.
	await page.goto(`/p/${project}/tree`);
	const proposed = page.locator('ul.tree li.proposed', { hasText: question });
	await expect(proposed.locator('.tag')).toHaveText('In a round');
	await expect(proposed).toContainText(`@${handle}`);
	await expect(proposed.getByRole('link', { name: 'Back' })).toHaveAttribute('href', /\?back=\d+$/);

	// A visitor who is not signed in sees the same tree.
	const other = await (await browser.newContext()).newPage();
	await other.goto(`/p/${project}/tree`);
	await expect(other.locator('ul.tree li.proposed', { hasText: question })).toBeVisible();
	await other.context().close();
});

test('questions that the editor takes off its list are kept, behind one line', async ({ page }) => {
	// On this prompt the stand-in's editor rewrites its list after each run, as real models commonly do.
	await signIn(page, handle);
	const project = await submitPrompt(page, 'What has resurfacing a canal towpath done for cycling? A prompt whose list is rewritten.');
	expect((await donateViaApi(page, project, 0.3, 'anthropic/claude-opus-5.5')).status).toBe(201);
	await finished(page);

	await page.goto(`/p/${project}/tree`);
	await expect(page.locator('.stats-strip div', { hasText: 'set aside' }).locator('dd')).toHaveText('2');
	const root = page.locator('ul.tree > li').first();
	// They are not in the way until they are asked for.
	await expect(page.locator('ul.tree li.aside')).toHaveCount(0);
	const group = root.getByRole('button', { name: '2 questions set aside by the editor' });
	await expect(group).toHaveAttribute('aria-expanded', 'false');
	await group.click();
	const aside = page.locator('ul.tree li.aside', { hasText: 'How are injuries on towpaths recorded?' });
	await expect(aside.locator('.tag')).toHaveText('Set aside');
	await expect(aside).toContainText('Taken off the list by the editor after run 2');
	await expect(aside.getByRole('link', { name: 'Propose' })).toBeVisible();
	// The question that the second run researched came from the first run's list, and what replaced the others is open.
	await expect(root.locator('> ul > li', { hasText: 'Which routes were counted for a full year?' }).locator('> .row')).toContainText('Run 2');
	await expect(page.locator('ul.tree li.open', { hasText: 'Which authorities publish their counts?' })).toContainText('Listed by the editor after run 2');

	// After the first run, those questions were still open, and are shown as they stood.
	await page.getByRole('button', { name: 'One run earlier' }).click();
	await expect(page.locator('.time [role=status]')).toContainText('After run 1 of 2');
	await expect(page.locator('ul.tree li.open', { hasText: 'How are injuries on towpaths recorded?' }).locator('.tag')).toHaveText('Open');
	await expect(page.getByRole('button', { name: /set aside by the editor/ })).toHaveCount(0);
});

test('a prompt with no research has a tree that says so, and the tree fits a phone', async ({ page }) => {
	await signIn(page, handle);
	const empty = await submitPrompt(page, 'What is known about the acoustics of covered markets? A prompt with no runs.');
	await page.goto(`/p/${empty}/tree`);
	await expect(page.getByText('No question has been researched as yet.')).toBeVisible();

	await page.setViewportSize({ width: 390, height: 800 });
	for (const path of [`/p/${slug}/tree`, `/p/${slug}`]) {
		await page.goto(path);
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		expect(overflow).toBeLessThanOrEqual(0);
	}
});
