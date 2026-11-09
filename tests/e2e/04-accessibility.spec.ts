import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { saveKey, signIn, submitPrompt, uniqueHandle } from './helpers.ts';

test('no serious accessibility problems on any page or dialog', async ({ page }) => {
	test.setTimeout(120_000);
	const check = async (label: string) => {
		await page.waitForTimeout(350);
		const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
		const serious = results.violations
			.filter((v) => v.impact === 'serious' || v.impact === 'critical')
			.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
		expect(serious, label).toEqual([]);
	};

	for (const scheme of ['light', 'dark'] as const) {
		await page.context().clearCookies();
		await page.emulateMedia({ colorScheme: scheme });
		const handle = uniqueHandle(`a11y${scheme[0]}`);
		await signIn(page, handle);
		const slug = await submitPrompt(page, 'Which measures reduce fatigue among nurses on rotating shifts?');
		for (const path of ['/', '/prompts', '/prompts?q=nothing-matches-this', '/terms', '/privacy', `/p/${slug}`, `/p/${slug}/runs`, `/p/${slug}/repository`, '/leaderboards', '/leaderboards?board=donors', '/submit', '/about', '/account', `/u/${handle}`, '/nothing-here']) {
			await page.goto(path);
			await check(`${path} (${scheme})`);
		}

		await page.goto(`/p/${slug}`);
		await page.getByRole('button', { name: 'Report this project' }).click();
		await check(`report form (${scheme})`);
		await page.keyboard.press('Escape');

		await page.getByRole('button', { name: 'Donate' }).first().click();
		await check(`key form (${scheme})`);
		await page.keyboard.press('Escape');

		await saveKey(page, 'sk-or-v1-capped-a11y');
		await page.reload();
		await page.getByRole('button', { name: 'Donate' }).first().click();
		await expect(page.getByRole('dialog').getByRole('radio').first()).toBeAttached();
		await check(`donate form (${scheme})`);
		await page.keyboard.press('Escape');

		await page.getByRole('button', { name: 'Generate a card' }).click();
		await check(`share dialog (${scheme})`);
		await page.keyboard.press('Escape');
	}

	await page.context().clearCookies();
	await signIn(page, 'launchadmin');
	for (const scheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: scheme });
		await page.goto('/admin');
		await check(`admin (${scheme})`);
	}
});

test('the page can be used at 200% text size without losing the controls', async ({ page }) => {
	await page.setViewportSize({ width: 640, height: 800 });
	await page.goto('/');
	await page.addStyleTag({ content: 'html { font-size: 200%; }' });
	await expect(page.getByRole('link', { name: 'Leaderboards' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'OpenSearch' })).toBeVisible();
});

test('reduced motion is respected', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/about');
	const duration = await page.locator('a').first().evaluate((el) => getComputedStyle(el).transitionDuration);
	expect(parseFloat(duration)).toBeLessThan(0.01);
});
