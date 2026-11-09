// `npm run preflight`: checks a real configuration before launch. Nothing is changed.
//   npm run preflight                 configuration and public endpoints only; spends nothing
//   npm run preflight -- --key sk-or-v1-...   also makes one real request of the kind a run makes, with
//                                     web search, on an inexpensive model; costs about a cent
import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');
const e = process.env;
const OPENROUTER = 'https://openrouter.ai/api/v1';

let failures = 0;
const ok = (text) => console.log(`  pass  ${text}`);
const warn = (text) => console.log(`  warn  ${text}`);
const bad = (text) => {
	failures += 1;
	console.log(`  FAIL  ${text}`);
};

console.log('\nConfiguration');
const origin = e.ORIGIN || '';
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(origin);
if (!origin) bad('ORIGIN is not set.');
else if (isLocal) warn(`ORIGIN is ${origin}, which is only suitable for testing.`);
else if (!origin.startsWith('https://')) bad(`ORIGIN must use https: ${origin}`);
else if (origin.endsWith('/')) bad(`ORIGIN must not end with a slash: ${origin}`);
else ok(`ORIGIN is ${origin}`);

const built = existsSync('build/.origin') ? readFileSync('build/.origin', 'utf8').trim() : '';
if (!built) bad('No build was found. `npm run build` should be run.');
else if (built !== origin) bad(`The build was made for ${built}. \`npm run build\` should be run again.`);
else ok('The build matches ORIGIN.');

if (!e.ENCRYPTION_KEY) bad('ENCRYPTION_KEY is not set. `npm run setup` creates one.');
else if (Buffer.from(e.ENCRYPTION_KEY, 'base64').length !== 32) bad('ENCRYPTION_KEY must be 32 bytes, base64 encoded.');
else ok('ENCRYPTION_KEY is set.');

if (e.X_CLIENT_ID && e.X_CLIENT_SECRET) ok('X_CLIENT_ID and X_CLIENT_SECRET are set.');
else bad('X_CLIENT_ID and X_CLIENT_SECRET must both be set.');
if (origin) console.log(`        The callback registered with X must be exactly ${origin.replace(/\/$/, '')}/auth/x/callback`);

for (const name of ['ALLOW_DEV_SIGNIN', 'DEMO_MODE']) {
	if (e[name] === '1') bad(`${name} must not be set on a public site.`);
}
for (const name of ['OPENROUTER_BASE_URL', 'X_AUTHORIZE_URL', 'X_API_BASE']) {
	if (e[name]) bad(`${name} is for tests only and should be removed.`);
}

if (e.ADMIN_HANDLES) ok(`ADMIN_HANDLES is ${e.ADMIN_HANDLES}`);
else bad('ADMIN_HANDLES is not set, so nothing could be taken down from the site.');
if (e.CONTACT_EMAIL) ok(`CONTACT_EMAIL is ${e.CONTACT_EMAIL}`);
else warn('CONTACT_EMAIL is not set, so the terms and privacy pages give no address for complaints.');
if (e.ADDRESS_HEADER) ok(`ADDRESS_HEADER is ${e.ADDRESS_HEADER}, with XFF_DEPTH ${e.XFF_DEPTH ?? '1'}`);
else if (isLocal) warn('ADDRESS_HEADER is not set. A public site will not start without it.');
else bad('ADDRESS_HEADER must be set, usually to X-Forwarded-For.');

console.log('\nThis machine');
const major = Number(process.versions.node.split('.')[0]);
if (major >= 23 || (major === 22 && Number(process.versions.node.split('.')[1]) >= 17)) ok(`Node ${process.versions.node}`);
else bad(`Node ${process.versions.node} is too old. 22.17 or later is required.`);
try {
	ok(execFileSync('git', ['--version'], { encoding: 'utf8' }).trim());
} catch {
	bad('git could not be run.');
}
const dataDir = resolve(e.DATA_DIR || 'data');
try {
	mkdirSync(dataDir, { recursive: true });
	accessSync(dataDir, constants.W_OK);
	ok(`The data folder can be written to: ${dataDir}`);
} catch {
	bad(`The data folder cannot be written to: ${dataDir}`);
}
if (existsSync('assets/card-fonts')) ok('The card fonts are in place.');
else bad('assets/card-fonts was not found. This must be run from the project folder.');

console.log('\nOpenRouter');
let cheapest;
try {
	const res = await fetch(`${OPENROUTER}/models`, { signal: AbortSignal.timeout(20_000) });
	if (!res.ok) throw new Error(`status ${res.status}`);
	const { data } = await res.json();
	const usable = data.filter(
		(m) =>
			Number(m.pricing?.prompt) > 0 &&
			Number(m.pricing?.completion) > 0 &&
			m.context_length >= 32_000 &&
			!m.id.endsWith(':free') &&
			!m.id.endsWith(':batch') &&
			(!m.architecture?.output_modalities || m.architecture.output_modalities.join() === 'text') &&
			(m.top_provider?.max_completion_tokens ?? Infinity) >= 8_000 &&
			(!m.supported_parameters || m.supported_parameters.includes('max_tokens') || m.supported_parameters.includes('max_completion_tokens'))
	);
	ok(`The model list was read: ${usable.length} of ${data.length} models are usable here.`);
	cheapest =
		usable.find((m) => m.id === 'anthropic/claude-haiku-5.5') ??
		usable.sort((a, b) => Number(a.pricing.completion) - Number(b.pricing.completion))[0];
} catch (err) {
	bad(`The model list could not be read: ${err.message}`);
}

const keyIndex = process.argv.indexOf('--key');
const key = keyIndex > 0 ? process.argv[keyIndex + 1] : '';
if (key) {
	const auth = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'OpenSearch preflight' };
	try {
		const res = await fetch(`${OPENROUTER}/key`, { headers: auth, signal: AbortSignal.timeout(20_000) });
		if (!res.ok) throw new Error(`status ${res.status}`);
		const { data } = await res.json();
		ok(`The key was accepted. Limit: ${data.limit ?? 'none'}, remaining: ${data.limit_remaining ?? 'n/a'}.`);
		if (data.limit == null) warn('This key has no spending limit.');
	} catch (err) {
		bad(`The key check failed: ${err.message}`);
	}
	if (cheapest) {
		try {
			const res = await fetch(`${OPENROUTER}/chat/completions`, {
				method: 'POST',
				headers: auth,
				signal: AbortSignal.timeout(60_000),
				body: JSON.stringify({
					model: cheapest.id,
					stream: true,
					max_tokens: 2000,
					reasoning: { effort: 'low', exclude: true },
					plugins: [{ id: 'web', engine: 'exa', max_results: 3 }],
					messages: [
						{ role: 'system', content: 'Reply in one sentence, and cite one source as a Markdown link.' },
						{ role: 'user', content: 'What is the boiling point of water at sea level?' }
					]
				})
			});
			if (!res.ok) throw new Error(`status ${res.status}: ${(await res.text()).slice(0, 200)}`);
			const body = await res.text();
			const chunks = body.split('\n').filter((l) => l.startsWith('data:') && !l.includes('[DONE]')).map((l) => JSON.parse(l.slice(5)));
			const text = chunks.map((c) => c.choices?.[0]?.delta?.content ?? '').join('');
			const finish = chunks.map((c) => c.choices?.[0]?.finish_reason).find(Boolean);
			const cost = chunks.find((c) => c.usage)?.usage?.cost;
			const cited = chunks.some((c) => c.choices?.[0]?.delta?.annotations?.length || c.choices?.[0]?.message?.annotations?.length);
			if (!finish) bad('The stream ended without a finish reason.');
			else if (!text.trim()) bad(`${cheapest.id} finished (${finish}) having written nothing.`);
			else ok(`A completion was streamed from ${cheapest.id}, and finished with "${finish}": ${text.trim().slice(0, 70)}`);
			if (finish === 'length') warn('The reply reached its length limit, so reasoning may be using more of the allowance than expected.');
			if (cited) ok('Web search returned sources in the stream.');
			else warn('No sources arrived as annotations. Links written in the text will still be kept.');
			if (typeof cost === 'number') ok(`OpenRouter reported the cost: $${cost}`);
			else bad('OpenRouter did not report usage.cost, so amounts would be estimated.');
		} catch (err) {
			bad(`The completion failed: ${err.message}`);
		}
	}
} else {
	console.log('        No key was given, so no completion was attempted. A capped key may be passed with --key.');
}

console.log(failures ? `\n${failures} problem${failures === 1 ? '' : 's'} must be fixed before launch.\n` : '\nNothing is blocking a launch.\n');
process.exit(failures ? 1 : 0);
