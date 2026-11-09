import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

let counter = 0;
export const uniqueHandle = (base = 'user') => `${base}${Date.now() % 100000}${counter++}`.slice(0, 15);

export async function signIn(page: Page, handle: string, next = '/') {
	await page.goto(`/auth/dev?next=${encodeURIComponent(next)}`);
	await page.getByLabel('Handle').fill(handle);
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.waitForURL((url) => url.pathname === next);
}

/** Saves a key through the interface's own endpoint, using the page's session. */
export async function saveKey(page: Page, key: string) {
	const status = await page.evaluate(async (k) => {
		const res = await fetch('/api/key', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ key: k, acknowledged: true })
		});
		return res.status;
	}, key);
	expect(status).toBe(200);
}

export async function submitPrompt(page: Page, prompt: string): Promise<string> {
	await page.goto('/submit');
	await page.getByLabel('Prompt').fill(prompt);
	await page.getByRole('button', { name: 'Submit prompt' }).click();
	await page.waitForURL(/\/p\/[a-z0-9-]+/);
	return new URL(page.url()).pathname.split('/')[2];
}

export async function donateViaApi(page: Page, slug: string, dollars: number, model = 'anthropic/claude-sonnet-5.5') {
	return page.evaluate(
		async ({ slug, dollars, model }) => {
			const res = await fetch(`/api/projects/${slug}/donations`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ amountMicro: Math.round(dollars * 1e6), model })
			});
			return { status: res.status, body: await res.json() };
		},
		{ slug, dollars, model }
	);
}

export async function donationStatus(request: APIRequestContext, page: Page) {
	await page.goto('/account');
	return page.locator('.donations li').first().innerText();
}
