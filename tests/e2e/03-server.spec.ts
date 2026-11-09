// These tests run their own copy of the server, so that it can be configured for X and killed.
import { expect, test } from '@playwright/test';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { createServer, type Server } from 'node:http';

const PORT = 4174;
const ORIGIN = `http://localhost:${PORT}`;
const MOCK_X = 4175;
const MOCK_OR = 8797;
const DATA = 'data-e2e-server';
const CLIENT = 'test-client-id';
const SECRET = 'test-client-secret';

test.describe.configure({ mode: 'serial' });

let mockOr: ChildProcess;
let app: ChildProcess;
let xServer: Server;
const challenges = new Map<string, string>();
let tokenCalls = 0;

function startApp(extra: Record<string, string> = {}) {
	app = spawn('node', ['build-e2e-server/index.js'], {
		stdio: 'ignore',
		env: {
			...process.env,
			PORT: String(PORT),
			DATA_DIR: DATA,
			OPENROUTER_BASE_URL: `http://127.0.0.1:${MOCK_OR}/api/v1`,
			X_CLIENT_ID: CLIENT,
			X_CLIENT_SECRET: SECRET,
			X_AUTHORIZE_URL: `http://localhost:${MOCK_X}/i/oauth2/authorize`,
			X_API_BASE: `http://localhost:${MOCK_X}`,
			ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
			ALLOW_DEV_SIGNIN: '',
			DEMO_MODE: '',
			...extra
		}
	});
}

async function waitUp() {
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch(ORIGIN)).ok) return;
		} catch {
			/* Not yet listening. */
		}
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error('The server did not start.');
}

async function waitUpWith(headers: Record<string, string>) {
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch(ORIGIN, { headers })).ok) return;
		} catch {
			/* Not yet listening. */
		}
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error('The server did not start.');
}

test.beforeAll(async () => {
	test.setTimeout(180_000);
	rmSync(DATA, { recursive: true, force: true });
	execFileSync('node', ['scripts/build.mjs'], { stdio: 'ignore', env: { ...process.env, ORIGIN, BUILD_DIR: 'build-e2e-server' } });
	mockOr = spawn('node', ['scripts/mock-openrouter.mjs'], { stdio: 'ignore', env: { ...process.env, MOCK_PORT: String(MOCK_OR), MOCK_QUIET: '1', MOCK_DELAY: '40' } });

	// A stand-in for X. It checks PKCE and the client's credentials as X does.
	xServer = createServer(async (req, res) => {
		const url = new URL(req.url!, `http://localhost:${MOCK_X}`);
		if (url.pathname === '/i/oauth2/authorize') {
			expect(url.searchParams.get('client_id')).toBe(CLIENT);
			expect(url.searchParams.get('response_type')).toBe('code');
			expect(url.searchParams.get('code_challenge_method')).toBe('S256');
			expect(url.searchParams.get('scope')).toBe('tweet.read users.read');
			const code = randomBytes(8).toString('hex');
			challenges.set(code, url.searchParams.get('code_challenge')!);
			const back = new URL(url.searchParams.get('redirect_uri')!);
			back.searchParams.set('code', code);
			back.searchParams.set('state', url.searchParams.get('state')!);
			res.writeHead(302, { Location: back.toString() }).end();
		} else if (url.pathname === '/2/oauth2/token') {
			tokenCalls++;
			let raw = '';
			for await (const chunk of req) raw += chunk;
			const body = new URLSearchParams(raw);
			const expected = `Basic ${Buffer.from(`${CLIENT}:${SECRET}`).toString('base64')}`;
			const challenge = challenges.get(body.get('code') ?? '');
			const computed = createHash('sha256').update(body.get('code_verifier') ?? '').digest('base64url');
			if (req.headers.authorization !== expected || !challenge || challenge !== computed || body.get('grant_type') !== 'authorization_code') {
				res.writeHead(400).end('{"error":"invalid_request"}');
				return;
			}
			res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ access_token: 'token-abc', token_type: 'bearer' }));
		} else if (url.pathname === '/2/users/me') {
			if (req.headers.authorization !== 'Bearer token-abc') {
				res.writeHead(401).end();
				return;
			}
			res.writeHead(200, { 'Content-Type': 'application/json' }).end(
				JSON.stringify({ data: { id: '1234567', username: 'real_person', name: 'A Real Person', profile_image_url: 'https://pbs.twimg.com/profile_images/1/a_normal.jpg' } })
			);
		} else {
			res.writeHead(404).end();
		}
	}).listen(MOCK_X);

	startApp();
	await waitUp();
});

test.afterAll(() => {
	app?.kill('SIGKILL');
	mockOr?.kill('SIGKILL');
	xServer?.close();
	rmSync(DATA, { recursive: true, force: true });
});

test('signing in with X works from start to finish, and no token is kept', async ({ page }) => {
	await page.goto(`${ORIGIN}/submit`);
	await page.getByRole('link', { name: 'Connect X to submit' }).click();
	await page.waitForURL(`${ORIGIN}/submit`);
	await expect(page.getByRole('button', { name: 'Submit prompt' })).toBeVisible();
	expect(tokenCalls).toBe(1);
	await page.goto(`${ORIGIN}/account`);
	await expect(page.getByText('A Real Person')).toBeVisible();
	await expect(page.getByRole('link', { name: '@real_person', exact: true })).toBeVisible();
	const cookies = await page.context().cookies();
	const session = cookies.find((c) => c.name === 'os_session');
	expect(session?.httpOnly).toBe(true);
	expect(session?.sameSite).toBe('Lax');
	expect(cookies.find((c) => c.name === 'os_oauth')).toBeUndefined();
	const dump = execFileSync('sh', ['-c', `cat ${DATA}/opensearch.sqlite* | strings`]).toString();
	expect(dump).not.toContain('token-abc');
});

test('a forged or stale callback is turned away', async ({ page, context }) => {
	await context.clearCookies();
	await page.goto(`${ORIGIN}/auth/x/callback?code=abc&state=forged`);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('The sign-in request has expired.');
	await expect(page.getByRole('link', { name: 'Connect X' }).first()).toBeVisible();
});

test('prototype sign-in is unavailable once X is configured', async ({ request }) => {
	expect((await request.get(`${ORIGIN}/auth/dev`)).status()).toBe(404);
	const res = await request.post(`${ORIGIN}/auth/dev`, {
		headers: { Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
		data: 'handle=intruder'
	});
	expect(res.status()).toBe(404);
});

test('with X unconfigured, a production server offers no sign-in at all', async ({ request }) => {
	app.kill('SIGKILL');
	await new Promise((r) => setTimeout(r, 300));
	startApp({ X_CLIENT_ID: '', X_CLIENT_SECRET: '' });
	await waitUp();
	expect((await request.get(`${ORIGIN}/auth/dev`)).status()).toBe(404);
	const res = await request.get(`${ORIGIN}/auth/x?next=/`, { maxRedirects: 0 });
	expect(res.headers().location).toBe('/auth/unavailable');
	app.kill('SIGKILL');
	await new Promise((r) => setTimeout(r, 300));
});

test('prototype sign-in refuses connections from other machines, even when enabled', async ({ request }) => {
	const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
	test.skip(!lan, 'This machine has no network address to test from.');
	startApp({ X_CLIENT_ID: '', X_CLIENT_SECRET: '', ALLOW_DEV_SIGNIN: '1', HOST: '0.0.0.0' });
	await waitUp();
	expect((await request.get(`http://${lan}:${PORT}/auth/dev`)).status()).toBe(404);
	const forged = await request.post(`http://${lan}:${PORT}/auth/dev`, {
		headers: { Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
		data: 'handle=victim'
	});
	expect(forged.status()).toBe(404);
	expect((await request.get(`http://localhost:${PORT}/auth/dev`)).status()).toBe(200);
	app.kill('SIGKILL');
	await new Promise((r) => setTimeout(r, 300));
	startApp();
	await waitUp();
});

test('a crash cannot spend more than was donated', async ({ page }) => {
	await page.goto(`${ORIGIN}/auth/x?next=/`);
	await page.waitForURL(`${ORIGIN}/`);
	await page.evaluate(async () => {
		await fetch('/api/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'sk-or-v1-capped-crash', acknowledged: true }) });
	});
	await page.goto(`${ORIGIN}/submit`);
	await page.getByLabel('Prompt').fill('How well do heat pumps work? A prompt for repeated crashes.');
	await page.getByRole('button', { name: 'Submit prompt' }).click();
	await page.waitForURL(/\/p\//);
	const slug = new URL(page.url()).pathname.split('/')[2];
	const amount = 300_000;
	await page.evaluate(
		async ({ slug, amount }) => fetch(`/api/projects/${slug}/donations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountMicro: amount, model: 'anthropic/claude-sonnet-5.5' }) }),
		{ slug, amount }
	);
	// The server dies repeatedly, part way through each attempt.
	for (let i = 0; i < 4; i++) {
		await page.goto(`${ORIGIN}/p/${slug}`);
		await page.waitForTimeout(350);
		app.kill('SIGKILL');
		await new Promise((r) => setTimeout(r, 200));
		startApp();
		await waitUp();
	}
	await expect(async () => {
		await page.goto(`${ORIGIN}/account`);
		await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);
	}).toPass({ timeout: 45_000 });
	const line = await page.locator('.donations li').first().locator('.sum').innerText();
	const spent = Number(line.match(/\$([\d.]+) of/)![1]);
	// However often it crashed, what is counted stays within the donation, give or take the last estimate.
	expect(spent).toBeLessThanOrEqual(0.33);
});

test('work is resumed after the server is killed part way through a run', async ({ page }) => {
	await page.goto(`${ORIGIN}/auth/x?next=/`);
	await page.waitForURL(`${ORIGIN}/`);
	const status = await page.evaluate(async () => {
		const res = await fetch('/api/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'sk-or-v1-capped-restart', acknowledged: true }) });
		return res.status;
	});
	expect(status).toBe(200);

	await page.goto(`${ORIGIN}/submit`);
	await page.getByLabel('Prompt').fill('How well do heat pumps work? A prompt for restarts.');
	await page.getByRole('button', { name: 'Submit prompt' }).click();
	await page.waitForURL(/\/p\//);
	const slug = new URL(page.url()).pathname.split('/')[2];

	await page.evaluate(
		async (slug) => fetch(`/api/projects/${slug}/donations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountMicro: 4_000_000, model: 'anthropic/claude-sonnet-5.5' }) }),
		slug
	);
	await page.reload();
	await expect(page.getByRole('region', { name: 'Run in progress' })).toBeVisible();

	app.kill('SIGKILL');
	await new Promise((r) => setTimeout(r, 300));
	startApp();
	await waitUp();

	await expect(async () => {
		await page.goto(`${ORIGIN}/account`);
		await expect(page.locator('.donations li').first()).toContainText('Finished');
	}).toPass({ timeout: 60_000 });

	await page.goto(`${ORIGIN}/p/${slug}/runs`);
	const numbers = (await page.locator('.seq').allInnerTexts()).map(Number).sort((a, b) => a - b);
	expect(numbers.length).toBeGreaterThan(0);
	expect(numbers).toEqual(numbers.map((_, i) => i + 1));
	await page.goto(`${ORIGIN}/p/${slug}/repository`);
	await expect(page.locator('.log li')).toHaveCount(numbers.length + 1);
});

test('a stored key still works after a restart', async ({ page }) => {
	await page.goto(`${ORIGIN}/auth/x?next=/account`);
	await page.waitForURL(`${ORIGIN}/account`);
	await expect(page.getByText('sk-or-…tart')).toBeVisible();
});

test('limits apply per visitor, and flooding is refused with a clear message', async ({ page, request }) => {
	app.kill('SIGKILL');
	await new Promise((r) => setTimeout(r, 300));
	startApp({ ADDRESS_HEADER: 'x-test-address', MAX_PROMPTS_PER_HOUR: '2' });
	await waitUpWith({ 'x-test-address': '10.0.0.1' });

	// One visitor reaches the limit on cards. Another, at a different address, is not affected.
	let limited: Response | undefined;
	for (let i = 0; i < 95; i++) {
		const res = await fetch(`${ORIGIN}/card/nothing.png`, { headers: { 'x-test-address': '10.0.0.2' } });
		if (res.status === 429) {
			limited = res;
			break;
		}
	}
	expect(limited, 'the limit was never reached').toBeTruthy();
	expect(Number(limited!.headers.get('retry-after'))).toBeGreaterThan(0);
	const other = await fetch(`${ORIGIN}/healthz`, { headers: { 'x-test-address': '10.0.0.3' } });
	expect(other.status).toBe(200);

	// The same limit cannot be avoided by encoding the address differently.
	const encoded = await fetch(`${ORIGIN}/%63ard/nothing.png`, { headers: { 'x-test-address': '10.0.0.2' } });
	expect(encoded.status).toBe(429);

	// The third prompt in an hour is refused, and the text is kept for the person to use later.
	await page.setExtraHTTPHeaders({ 'x-test-address': '10.0.0.4' });
	await page.goto(`${ORIGIN}/auth/x?next=/submit`);
	await page.waitForURL(`${ORIGIN}/submit`);
	for (const n of [1, 2]) {
		await page.goto(`${ORIGIN}/submit`);
		await page.getByLabel('Prompt').fill(`Flood prompt number ${n}, about nothing in particular.`);
		await page.getByRole('button', { name: 'Submit prompt' }).click();
		await page.waitForURL(/\/p\//);
	}
	await page.goto(`${ORIGIN}/submit`);
	await page.getByLabel('Prompt').fill('Flood prompt number 3, about nothing in particular.');
	await page.getByRole('button', { name: 'Submit prompt' }).click();
	await expect(page.getByRole('alert')).toContainText('No more than 2 prompts');
	await expect(page.getByLabel('Prompt')).toHaveValue('Flood prompt number 3, about nothing in particular.');
	expect(request).toBeTruthy();
});

test('live connections from one address are limited, and are released when closed', async () => {
	const controllers: AbortController[] = [];
	const statuses: number[] = [];
	const slug = (await (await fetch(`${ORIGIN}/api/activity`, { headers: { 'x-test-address': '10.0.0.5' } })).json()).items[0].slug;
	for (let i = 0; i < 13; i++) {
		const controller = new AbortController();
		controllers.push(controller);
		const res = await fetch(`${ORIGIN}/p/${slug}/events`, { headers: { 'x-test-address': '10.0.0.6' }, signal: controller.signal });
		statuses.push(res.status);
	}
	expect(statuses.slice(0, 12).every((s) => s === 200)).toBe(true);
	expect(statuses[12]).toBe(429);
	for (const c of controllers) c.abort();
	await new Promise((r) => setTimeout(r, 300));
	const again = await fetch(`${ORIGIN}/p/${slug}/events`, { headers: { 'x-test-address': '10.0.0.6' }, signal: AbortSignal.timeout(2_000) });
	expect(again.status).toBe(200);
	await again.body?.cancel();
});
