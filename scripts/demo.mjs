// `npm run demo`: the whole site on this machine, with simulated sign-in and model responses.
// Sample data is kept in data-demo/ and never mixes with real data.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const PORT = process.env.PORT || '3000';
const ORIGIN = `http://localhost:${PORT}`;
const DATA_DIR = process.env.DEMO_DATA_DIR || 'data-demo';
const MOCK_PORT = process.env.MOCK_PORT || '8799';
const noSeed = process.argv.includes('--no-seed');

const BUILD_DIR = process.env.BUILD_DIR || 'build';
const builtFor = existsSync(`${BUILD_DIR}/.origin`) ? readFileSync(`${BUILD_DIR}/.origin`, 'utf8').trim() : '';
if (builtFor !== ORIGIN || process.argv.includes('--build')) {
	console.log('The site is being built.');
	const built = spawnSync('node', ['scripts/build.mjs'], {
		stdio: ['ignore', 'ignore', 'inherit'],
		env: { ...process.env, ORIGIN, BUILD_DIR }
	});
	if (built.status !== 0) process.exit(built.status ?? 1);
}

const mock = spawn('node', ['scripts/mock-openrouter.mjs'], {
	stdio: 'ignore',
	env: { ...process.env, MOCK_PORT, MOCK_QUIET: '1', MOCK_DELAY: process.env.MOCK_DELAY ?? '28' }
});

const app = spawn('node', [`${BUILD_DIR}/index.js`], {
	stdio: ['ignore', 'inherit', 'inherit'],
	env: {
		...process.env,
		PORT,
		HOST: '127.0.0.1',
		DATA_DIR,
		DEMO_MODE: '1',
		ALLOW_DEV_SIGNIN: '1',
		OPENROUTER_BASE_URL: `http://127.0.0.1:${MOCK_PORT}/api/v1`,
		X_CLIENT_ID: '',
		X_CLIENT_SECRET: '',
		ENCRYPTION_KEY: '' // A key file is kept in data-demo/.
	}
});

const stop = () => {
	app.kill();
	mock.kill();
	process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
app.on('exit', () => {
	mock.kill();
	process.exit(0);
});

// Chrome is preferred. The default browser is used where Chrome is not installed.
function openBrowser(url) {
	const attempts = {
		darwin: [
			['open', ['-a', 'Google Chrome', url]],
			['open', [url]]
		],
		win32: [
			['cmd', ['/c', 'start', '', 'chrome', url]],
			['cmd', ['/c', 'start', '', url]]
		]
	}[process.platform] ?? [
		['google-chrome', [url]],
		['xdg-open', [url]]
	];
	const attempt = (index) => {
		if (index >= attempts.length) return;
		const [command, args] = attempts[index];
		const child = spawn(command, args, { stdio: 'ignore', detached: true });
		child.on('error', () => attempt(index + 1));
		child.on('exit', (code) => {
			if (code) attempt(index + 1);
		});
		child.unref();
	};
	attempt(0);
}

async function waitForServer() {
	for (let i = 0; i < 100; i++) {
		try {
			const res = await fetch(ORIGIN);
			if (res.ok) return;
		} catch {
			/* Not yet listening. */
		}
		await new Promise((r) => setTimeout(r, 150));
	}
	throw new Error('The site did not start.');
}

class Client {
	cookie = '';
	async request(path, init = {}) {
		const res = await fetch(ORIGIN + path, {
			redirect: 'manual',
			...init,
			headers: { Origin: ORIGIN, Accept: 'text/html', Cookie: this.cookie, ...(init.headers ?? {}) }
		});
		const set = res.headers.get('set-cookie');
		if (set) this.cookie = set.split(';')[0];
		return res;
	}
	signIn(handle) {
		return this.request('/auth/dev', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ handle, next: '/' })
		});
	}
	saveKey(key) {
		return this.request('/api/key', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ key, acknowledged: true })
		});
	}
	async submit(prompt) {
		const res = await this.request('/submit', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ prompt })
		});
		return new URL(res.headers.get('location'), ORIGIN).pathname.split('/')[2];
	}
	donate(slug, dollars, model) {
		return this.request(`/api/projects/${slug}/donations`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ amountMicro: Math.round(dollars * 1e6), model })
		});
	}
}

const PROMPTS = [
	['j_whitlock', 'Which interventions have the strongest evidence for reducing antibiotic prescribing in general practice, and what do they cost per prescription avoided?'],
	['sana_iqbal', 'What does the published evidence say about the effect of a four-day working week on productivity, and how many of those studies had a control group?'],
	['h_ashworth', 'What has been learned from the first decade of offshore wind decommissioning, and who bears the cost when a developer fails?'],
	['mira_kovacs', 'How reliable are wearable heart-rate monitors during high-intensity exercise, and which validation studies were independent of the manufacturer?'],
	['t_oyelaran', 'How often are replication attempts in nutrition science published, and what proportion of them confirm the original finding?'],
	['beatrix_lund', 'What is the current state of perovskite solar cell durability under real outdoor conditions, as opposed to accelerated laboratory ageing?'],
	['r_castellano', 'Which ancient grain varieties have been shown to outperform modern wheat under drought, and is the evidence from field trials or from greenhouses?'],
	['sana_iqbal', 'How much does a one-degree rise in classroom temperature reduce test performance, and has anyone measured the effect of air conditioning directly?'],
	['j_whitlock', 'What do we know about the long-term cognitive effects of bilingual education, once the socio-economic background of the families is controlled for?'],
	['h_ashworth', 'How well do air-source heat pumps perform in cold, damp climates such as that of northern England, and what do they cost to run in older homes compared with gas boilers?'],
	['mira_kovacs', 'What is known about the effect of rotating shift patterns on sleep among hospital nurses, and which rota designs or other measures have been shown to reduce fatigue?'],
	['t_oyelaran', 'How has water quality changed in English rivers over the last twenty years, and how much of the decline can be attributed to sewage discharge as opposed to agriculture?'],
	['beatrix_lund', 'What has happened to public library use and funding in Britain since 2010, and what has helped to keep branches open?'],
	['r_castellano', 'How much of the material in an electric vehicle battery can be recovered through recycling at present, and is second-life use a better option?']
];

const DONORS = [
	['h_ashworth', 'sk-or-v1-capped-demo-a'],
	['mira_kovacs', 'sk-or-v1-capped-demo-b'],
	['t_oyelaran', 'sk-or-v1-capped-demo-c'],
	['beatrix_lund', 'sk-or-v1-capped-demo-d'],
	['r_castellano', 'sk-or-v1-capped-demo-e'],
	['j_whitlock', 'sk-or-v1-capped-demo-f'],
	['sana_iqbal', 'sk-or-v1-capped-demo-g']
];

// Indexes into PROMPTS. Several prompts are left unfunded, as they would be on the real site.
const DONATIONS = [
	[9, 'j_whitlock', 1, 'anthropic/claude-opus-5.5'],
	[9, 'sana_iqbal', 5, 'anthropic/claude-sonnet-5.5'],
	[11, 'r_castellano', 5, 'anthropic/claude-sonnet-5.5'],
	[11, 'j_whitlock', 0.5, 'anthropic/claude-haiku-5.5'],
	[10, 'h_ashworth', 2, 'anthropic/claude-sonnet-5.5'],
	[13, 'beatrix_lund', 2, 'google/gemini-3.8-flash'],
	[13, 'sana_iqbal', 1, 'x-ai/grok-4.7'],
	[12, 'mira_kovacs', 1, 'openai/gpt-5.6-luna-pro'],
	[0, 'h_ashworth', 3, 'anthropic/claude-sonnet-5.5'],
	[1, 'mira_kovacs', 1, 'anthropic/claude-haiku-5.5'],
	[3, 't_oyelaran', 1, 'google/gemini-3.8-flash'],
	[5, 'sana_iqbal', 2, 'anthropic/claude-sonnet-5.5']
];

/** How many days ago each of PROMPTS was submitted. */
const AGES = [0.2, 0.4, 1.5, 2, 3, 4, 5, 6, 8, 40, 22, 9, 3, 1];

async function seed() {
	const clients = new Map();
	for (const [handle, key] of DONORS) {
		const client = new Client();
		await client.signIn(handle);
		await client.saveKey(key);
		clients.set(handle, client);
	}
	// Submitted oldest first, so that the references follow the same order as the dates.
	const slugs = [];
	const order = PROMPTS.map((_, i) => i).sort((a, b) => AGES[b] - AGES[a]);
	for (const i of order) slugs[i] = await clients.get(PROMPTS[i][0]).submit(PROMPTS[i][1]);
	for (const [project, handle, dollars, model] of DONATIONS) {
		await clients.get(handle).donate(slugs[project], dollars, model);
	}
	const db = new DatabaseSync(`${DATA_DIR}/openresearch.sqlite`);
	const open = () => db.prepare(`SELECT COUNT(*) AS n FROM donations WHERE status IN ('queued','running')`).get().n;
	while (open() > 0) await new Promise((r) => setTimeout(r, 200));

	// Dates are spread out so that the time periods on the leaderboards differ.
	const DAY = 86_400_000;
	const now = Date.now();
	slugs.forEach((slug, i) => {
		const id = db.prepare('SELECT id FROM projects WHERE slug = ?').get(slug).id;
		const created = now - AGES[i] * DAY;
		db.prepare('UPDATE projects SET created_at = ? WHERE id = ?').run(created, id);
		db.prepare('UPDATE donations SET created_at = ? WHERE project_id = ?').run(created + DAY / 8, id);
		// Runs are spread between the submission and now, so that each project has a history to chart.
		const runs = db.prepare('SELECT id FROM runs WHERE project_id = ? ORDER BY seq').all(id);
		runs.forEach((run, n) => {
			const at = created + (now - created) * ((n + 1) / (runs.length + 1)) ** 0.7;
			db.prepare('UPDATE runs SET finished_at = ?, started_at = ? WHERE id = ?').run(at, at, run.id);
		});
	});
	db.close();
	console.log('Sample projects have been added.');
}

// Something is always happening in the demonstration, so that the live parts of the page can be seen.
function keepActive() {
	const client = new Client();
	const handles = ['j_whitlock', 'sana_iqbal', 'beatrix_lund', 'h_ashworth'];
	const models = ['anthropic/claude-sonnet-5.5', 'anthropic/claude-haiku-5.5', 'google/gemini-3.8-flash'];
	const pick = (list) => list[Math.floor(Math.random() * list.length)];
	const timer = setInterval(async () => {
		try {
			const db = new DatabaseSync(`${DATA_DIR}/openresearch.sqlite`, { readOnly: true });
			const slugs = db.prepare('SELECT slug FROM projects WHERE hidden_at IS NULL ORDER BY RANDOM() LIMIT 1').all();
			const open = db.prepare(`SELECT COUNT(*) AS n FROM donations WHERE status IN ('queued','running')`).get().n;
			db.close();
			if (open > 1 || slugs.length === 0) return;
			const handle = pick(handles);
			await client.signIn(handle);
			await client.saveKey(`sk-or-v1-capped-demo-${handle}`);
			await client.donate(slugs[0].slug, 0.1 + Math.random() * 0.25, pick(models));
		} catch {
			/* The next one may succeed. */
		}
	}, 25_000);
	timer.unref();
}

await waitForServer();
const db = new DatabaseSync(`${DATA_DIR}/openresearch.sqlite`, { readOnly: true });
const hasData = db.prepare('SELECT COUNT(*) AS n FROM projects').get().n > 0;
db.close();
if (!noSeed && !hasData) {
	console.log('Sample projects are being added. This takes about a minute.');
	await seed();
}
if (!noSeed) keepActive();
console.log(`\nThe demonstration is running at ${ORIGIN}`);
console.log('Any handle may be used to sign in. Keys that begin with sk-or-v1-capped are accepted.');
console.log('It is stopped with Ctrl-C.\n');
if (!process.argv.includes('--no-open')) openBrowser(ORIGIN);
