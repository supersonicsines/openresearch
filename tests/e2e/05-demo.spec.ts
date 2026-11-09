import { expect, test } from '@playwright/test';

test('the demo plays on the About page without errors or policy violations', async ({ page }) => {
	const problems: string[] = [];
	page.on('pageerror', (e) => problems.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error') problems.push(m.text());
	});
	await page.goto('/about');
	const stage = page.locator('.ss-stage');
	await expect(stage).toBeVisible();
	await expect(stage.locator('.osd-dialog[data-show]')).toBeAttached({ timeout: 10_000 });
	await expect(stage.locator('.ss-states__item[data-on]')).toHaveText('The report is being written.', { timeout: 15_000 });
	// The story reaches its payoff: the donor overtakes the one above.
	const donor = stage.locator('.osd-rank', { hasText: '@h_ashworth' });
	await expect(donor).toHaveAttribute('style', /translateY\(44px\)/, { timeout: 20_000 });
	await expect(page.getByRole('img', { name: /An illustration of the site in use/ })).toBeVisible();
	expect(problems).toEqual([]);
});

test('React is not downloaded on pages without the demo', async ({ page }) => {
	const loaded: string[] = [];
	page.on('response', (r) => {
		if (r.url().endsWith('.js')) loaded.push(r.url());
	});
	await page.goto('/leaderboards');
	await page.waitForLoadState('networkidle');
	const before = loaded.length;
	await page.goto('/about');
	await expect(page.locator('.ss-stage')).toBeVisible();
	expect(loaded.length).toBeGreaterThan(before);
});

test('the demo uses its phone design in a narrow column, without overflow', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 800 });
	await page.goto('/about');
	await expect(page.locator('.ss-stage[data-layout="compact"]')).toBeVisible();
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	expect(overflow).toBeLessThanOrEqual(0);
});

test('under reduced motion the demo holds its complete still', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/about');
	const stage = page.locator('.ss-stage');
	const status = stage.locator('.ss-states__item[data-on]');
	await expect(status).toHaveText('The findings are being updated.');
	await expect(stage.locator('.osd-rank', { hasText: '@h_ashworth' })).toHaveAttribute('style', /translateY\(44px\)/);
	await page.waitForTimeout(2500);
	await expect(status).toHaveText('The findings are being updated.');
	await expect(stage.locator('.osd-dialog[data-show]')).toHaveCount(0);
});

test('the demo follows the colour scheme of the device', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('/about');
	await expect(page.locator('.ss-stage[data-theme="dark"]')).toBeVisible();
	await page.emulateMedia({ colorScheme: 'light' });
	await expect(page.locator('.ss-stage[data-theme="light"]')).toBeVisible();
});
