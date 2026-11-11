// A stand-in for OpenRouter, for the demonstration and for tests. Nothing here leaves this machine.
//
// Keys select the behaviour:
//   sk-or-v1-capped...   a key with a $25 limit
//   sk-or-v1-small...    a key with $0.50 remaining
//   sk-or-v1-nolimit...  a key with no limit
//   sk-or-v1-spent...    a key whose limit has been used up
//   sk-or-v1-broke...    accepted by /key, but every completion returns 402
//   sk-or-v1-down...     every completion returns 503
//   sk-or-v1-midfail...  the stream breaks part of the way through
//   sk-or-v1-xss...      the report contains hostile markup
//   sk-or-v1-cutoff...   the stream closes early, with no finish and no usage
//   sk-or-v1-blank...    the model finishes having written nothing
//   sk-or-v1-held...     each key's first completion returns 402 with Retry-After, then all is well
//   sk-or-v1-length...   the report stops at its length limit, with finish_reason "length"
//   sk-or-v1-fading...   a key with $25 remaining when it is first checked twice, and nothing after that
//   anything else        rejected with 401
//
// GET /auth is the page on which a key is approved for a site without being copied. A choice is offered
// there, and the key that results begins with sk-or-v1-capped or sk-or-v1-nolimit accordingly.
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 8799);
const DELAY = Number(process.env.MOCK_DELAY ?? 28);

const MODELS = [
	['anthropic/claude-sonnet-5.5', 'Anthropic: Claude Sonnet 5.5', 2, 10],
	['anthropic/claude-opus-5.5', 'Anthropic: Claude Opus 5.5', 4, 20],
	['anthropic/claude-haiku-5.5', 'Anthropic: Claude Haiku 5.5', 0.1, 0.5],
	['openai/gpt-5.6-luna-pro', 'OpenAI: GPT-5.6 Luna Pro', 0.2, 1.2],
	['google/gemini-3.8-flash', 'Google: Gemini 3.8 Flash', 0.83, 4.13],
	['x-ai/grok-4.7', 'SpaceXAI: Grok 4.7', 2, 6],
	['deepseek/deepseek-v4.1-flash', 'DeepSeek: DeepSeek V4.1 Flash', 0.04, 0.5],
	['qwen/qwen3.8-flash', 'Qwen: Qwen3.8 Flash', 0.15, 0.47],
	['mistralai/mistral-large-4-0', 'Mistral: Mistral Large 4', 0.7, 2.1]
].map(([id, name, input, output]) => ({
	id,
	name,
	context_length: 1000000,
	architecture: { output_modalities: ['text'] },
	pricing: { prompt: String(input / 1e6), completion: String(output / 1e6) },
	top_provider: { max_completion_tokens: 64000 },
	supported_parameters: ['max_tokens', 'reasoning'],
	reasoning: { supported_efforts: ['high', 'medium', 'low'] }
}));

// Both are offered by the real service, and neither can be budgeted for. They must not be listed.
MODELS.push(
	{
		id: 'short/short-replies',
		name: 'Short: Short Replies',
		context_length: 1000000,
		architecture: { output_modalities: ['text'] },
		pricing: { prompt: '0.000001', completion: '0.000002' },
		top_provider: { max_completion_tokens: 2048 },
		supported_parameters: ['max_tokens']
	},
	{
		id: 'nolimit/no-token-parameter',
		name: 'NoLimit: No Token Parameter',
		context_length: 1000000,
		architecture: { output_modalities: ['text'] },
		pricing: { prompt: '0.000001', completion: '0.000002' },
		top_provider: { max_completion_tokens: null },
		supported_parameters: ['temperature']
	}
);

// Keys that have already been held back once, for sk-or-v1-held.
const heldOnce = new Set();

// Topics are matched against the prompt. All of this is sample text for demonstrations.
const TOPICS = [
	{
		match: /heat pump/i,
		reports: [
			['Performance in cold, damp climates depends mainly on correct sizing and low flow temperatures',
				'Field trials in the United Kingdom have reported seasonal performance figures of around 2.5 to 3.0 for existing homes, with the better results recorded where radiators were enlarged and flow temperatures were kept low. Poor outcomes were more often attributed to installation than to outdoor temperature.\n\nDefrost cycles in damp air do reduce output near freezing, but the effect is modest in a well sized system.',
				[['Electrification of Heat demonstration project', 'https://es.catapult.org.uk/project/electrification-of-heat/'], ['Heat pumps: overview', 'https://en.wikipedia.org/wiki/Heat_pump']]],
			['Running costs are governed by the ratio of electricity to gas prices',
				'Whether a heat pump is cheaper to run than a gas boiler depends largely on the relative price of the two fuels. At a seasonal performance of about 3, the unit price of electricity must be under roughly three times that of gas for a saving to appear.\n\nTime-of-use tariffs narrow the gap further where the system can pre-heat during cheaper periods.',
				[['Energy prices, Ofgem', 'https://www.ofgem.gov.uk/energy-price-cap']]],
			['Older solid-walled homes are not excluded, but insulation changes the sums',
				'Solid-walled homes have higher heat losses, so larger emitters or some insulation are usually needed. Modelling and trial data suggest that fabric improvements are the most cost-effective first step where walls are uninsulated, though they are not an absolute precondition.',
				[['Solid wall insulation', 'https://www.energysavingtrust.org.uk/advice/solid-wall-insulation/']]]
		],
		questions: ['How do installation standards differ between the best and worst performing systems?', 'What is the effect of time-of-use tariffs on annual running costs?', 'What grants are available for solid-walled homes?']
	},
	{
		match: /sleep|shift work/i,
		reports: [
			['Rotating shift patterns are associated with shorter and more broken sleep',
				'Reviews of shift-working populations consistently report shorter total sleep and poorer quality among those on rotating and night patterns. Forward rotation, moving from mornings to afternoons to nights, is generally tolerated better than backward rotation.',
				[['Shift work sleep disorder', 'https://en.wikipedia.org/wiki/Shift_work_sleep_disorder']]],
			['Bright light timing has the strongest evidence among non-drug measures',
				'Timed exposure to bright light during a night shift, together with dark sunglasses on the journey home, has been shown to help shift the body clock. Results vary, and the measure is hardest to apply on rapidly rotating rosters.',
				[['Light therapy', 'https://en.wikipedia.org/wiki/Light_therapy']]]
		],
		questions: ['Which rota designs reduce fatigue without reducing staffing cover?', 'What is the evidence for planned naps during night shifts?']
	},
	{
		match: /river|water quality|sewage/i,
		reports: [
			['Storm overflow data have become public, but ecological data remain patchy',
				'Event duration monitoring now records how often and for how long storm overflows discharge in England, and the figures are published annually. Measures of ecological harm are collected less often and at fewer sites, which limits what can be attributed to any single source.',
				[['Event duration monitoring', 'https://environment.data.gov.uk/dataset/21e15f12-0df8-4bfc-b763-45226c16a8ac']]],
			['Agriculture and wastewater are the principal pressures on most failing rivers',
				'Official assessments identify diffuse agricultural pollution and water company discharges as the most frequent reasons for rivers failing to reach good ecological status. The proportions differ considerably between catchments.',
				[['River basin management plans', 'https://www.gov.uk/government/collections/river-basin-management-plans-2021']]]
		],
		questions: ['How much do citizen science results agree with official monitoring?', 'Which catchment schemes have shown measurable recovery?']
	},
	{
		match: /library|libraries/i,
		reports: [
			['Library use has moved towards digital lending and community space',
				'Physical loans have fallen over a long period, while electronic lending and the use of libraries as warm, free public spaces have grown. Funding comparisons are complicated by differences in how local authorities report spending.',
				[['Public library', 'https://en.wikipedia.org/wiki/Public_library']]]
		],
		questions: ['Which funding models have kept branches open without reducing hours?']
	},
	{
		match: /battery|batteries|recycl/i,
		reports: [
			['Recovery rates are high for cobalt and nickel, and lower for lithium',
				'Established hydrometallurgical processes recover most of the cobalt and nickel in spent cells. Lithium has historically been recovered at lower rates, although newer plants report substantial improvements as prices have justified the extra steps.',
				[['Battery recycling', 'https://en.wikipedia.org/wiki/Battery_recycling']]],
			['Second-life use delays recycling but does not replace it',
				'Vehicle packs that no longer meet driving requirements can serve in stationary storage for some years. Testing and repackaging costs have limited uptake, and falling prices for new cells have narrowed the margin.',
				[['Second-life batteries', 'https://en.wikipedia.org/wiki/Electric_vehicle_battery']]]
		],
		questions: ['What share of packs reaches a recycler at present?', 'How do recycling emissions compare with those of primary mining?']
	},
	{
		match: /./,
		reports: [
			['An initial survey of the available evidence',
				'A first review of the question has been carried out. The available sources agree on the general outline, but differ on the size of the effects reported, and comparable long-term data are limited.\n\nThis text is sample output produced by the demonstration, and it should not be relied upon.',
				[['Example source', 'https://en.wikipedia.org/wiki/Research']]],
			['A second question has been examined',
				'Further sources have been consulted on the matter raised in the previous run. The results are consistent with the earlier report, with some additional detail on the conditions under which they hold.',
				[['Further example source', 'https://en.wikipedia.org/wiki/Evidence']]]
		],
		questions: ['What long-term data are available?', 'Which sources disagree, and why?']
	}
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seen = new Map();

function topicFor(text) {
	return TOPICS.find((t) => t.match.test(text));
}

function reportFor(system, key) {
	const prompt = system.match(/<prompt>\s*([\s\S]*?)\s*<\/prompt>/)?.[1] ?? '';
	const topic = topicFor(prompt) ?? TOPICS[0];
	const n = seen.get(prompt) ?? 0;
	seen.set(prompt, n + 1);
	if (key.startsWith('sk-or-v1-midfail')) {
		return { text: 'This report is long enough that the stream breaks before it is finished, however many times it is tried.', sources: [] };
	}
	if (key.startsWith('sk-or-v1-xss')) {
		return {
			text: '## Hostile output\n\n<script>window.__pwned = true</script><img src=x onerror="window.__pwned=true"><a href="javascript:window.__pwned=true">a link</a> [another](javascript:alert(1)) <iframe src="https://example.com"></iframe>\n\nPlain text remains.',
			sources: []
		};
	}
	const entry = topic.reports[n];
	if (!entry) return { text: 'NO NEW FINDINGS', sources: [] };
	const [heading, body, sources] = entry;
	const links = sources.map(([title, url]) => `[${title}](${url})`).join(', ');
	return {
		text: `## ${heading}\n\n${body}\n\nSources consulted: ${links}.`,
		sources: sources.map(([title, url]) => ({ title, url }))
	};
}

function editorReply(system, user) {
	const prompt = system.match(/<prompt>\s*([\s\S]*?)\s*<\/prompt>/)?.[1] ?? '';
	const current = system.match(/<findings>\s*([\s\S]*?)\s*<\/findings>/)?.[1] ?? '';
	const topic = topicFor(prompt);
	const n = seen.get(prompt) ?? 1;
	const previous = current.startsWith('None as yet') ? '' : current;
	const merged = previous ? `${previous}\n\n${user.trim()}` : user.trim();
	const questions = topic.questions.slice(Math.max(0, n - 1));
	const list = questions.map((q) => `- ${q}`).join('\n');
	return `<findings>\n${merged}\n</findings>\n<questions>\n${list}\n</questions>`;
}

function send(res, status, body) {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(body));
}

// How many times each sk-or-v1-fading key has been checked.
const fadingChecks = new Map();

function keyInfo(key, counted = false) {
	const base = { label: 'mock', usage: 0, is_free_tier: false, limit_reset: null };
	if (key.startsWith('sk-or-v1-fading')) {
		const checks = (fadingChecks.get(key) ?? 0) + (counted ? 1 : 0);
		fadingChecks.set(key, checks);
		return checks <= 2 ? { ...base, limit: 25, limit_remaining: 25 } : { ...base, limit: 25, usage: 25, limit_remaining: 0 };
	}
	if (key.startsWith('sk-or-v1-capped')) return { ...base, limit: 25, limit_remaining: 25 };
	if (key.startsWith('sk-or-v1-small')) return { ...base, limit: 1, usage: 0.5, limit_remaining: 0.5 };
	if (key.startsWith('sk-or-v1-spent')) return { ...base, limit: 5, usage: 5, limit_remaining: 0 };
	if (/^sk-or-v1-(nolimit|broke|down|midfail|xss|cutoff|blank|held|length)/.test(key)) return { ...base, limit: null, limit_remaining: null };
	return null;
}

// Codes issued by the approval page, each with the challenge it must be exchanged against.
const codes = new Map();

function approvalPage(res, url) {
	const callback = url.searchParams.get('callback_url') ?? '';
	const challenge = url.searchParams.get('code_challenge') ?? '';
	const state = url.searchParams.get('state');
	const link = (kind) => {
		const target = new URL(callback);
		if (kind) {
			const code = `${kind}-${randomBytes(9).toString('hex')}`;
			codes.set(code, challenge);
			target.searchParams.set('code', code);
			if (state) target.searchParams.set('state', state);
		}
		return target.toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;');
	};
	res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
	res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Stand-in for OpenRouter</title>
<body style="font: 16px/1.5 system-ui, sans-serif; max-width: 30rem; margin: 15vh auto; padding: 0 20px">
<h1 style="font-size: 1.25rem">Stand-in for OpenRouter</h1>
<p>On the real site, a key for OpenResearch would be approved here. Nothing leaves this machine.</p>
<p><a id="approve" href="${link('capped')}">Approve a key with a $25 limit</a></p>
<p><a id="approve-nolimit" href="${link('nolimit')}">Approve a key with no limit</a></p>
<p><a id="decline" href="${link('')}">Decline</a></p>
</body></html>`);
}

async function exchange(req, res) {
	let raw = '';
	for await (const chunk of req) raw += chunk;
	let body = {};
	try {
		body = JSON.parse(raw);
	} catch {
		/* Treated as an invalid code. */
	}
	const challenge = codes.get(body.code);
	codes.delete(body.code);
	const offered = createHash('sha256').update(String(body.code_verifier ?? '')).digest('base64url');
	if (challenge === undefined || challenge !== offered) {
		return send(res, 403, { error: { code: 403, message: 'Invalid code or code_verifier' } });
	}
	const kind = String(body.code).split('-')[0];
	return send(res, 200, { key: `sk-or-v1-${kind}-connected-${randomBytes(6).toString('hex')}` });
}

createServer(async (req, res) => {
	const key = (req.headers.authorization ?? '').replace('Bearer ', '');
	const url = new URL(req.url, 'http://127.0.0.1');
	if (url.pathname === '/auth') return approvalPage(res, url);
	if (url.pathname === '/api/v1/auth/keys') return req.method === 'POST' ? exchange(req, res) : send(res, 405, { error: { code: 405, message: 'Method Not Allowed' } });
	if (req.url === '/api/v1/models') return send(res, 200, { data: MODELS });
	if (req.url === '/api/v1/key') {
		const info = keyInfo(key, true);
		return info ? send(res, 200, { data: info }) : send(res, 401, { error: { code: 401, message: 'User not found.' } });
	}
	if (req.url !== '/api/v1/chat/completions') return send(res, 404, { error: { code: 404, message: 'Not found' } });

	if (!keyInfo(key)) return send(res, 401, { error: { code: 401, message: 'User not found.' } });
	if (key.startsWith('sk-or-v1-broke')) return send(res, 402, { error: { code: 402, message: 'Insufficient credits.' } });
	if (key.startsWith('sk-or-v1-down')) return send(res, 503, { error: { code: 503, message: 'No available providers.' } });
	if (key.startsWith('sk-or-v1-held') && !heldOnce.has(key)) {
		heldOnce.add(key);
		res.writeHead(402, { 'Content-Type': 'application/json', 'Retry-After': '1' });
		return res.end(JSON.stringify({ error: { code: 402, message: 'in_flight_budget_exhausted' } }));
	}

	let raw = '';
	for await (const chunk of req) raw += chunk;
	const body = JSON.parse(raw);
	const system = body.messages[0].content;
	const user = body.messages[1].content;
	const isEditor = !body.plugins;
	const reply = isEditor ? { text: editorReply(system, user), sources: [] } : reportFor(system, key);

	const model = MODELS.find((m) => m.id === body.model) ?? MODELS[0];
	// The sample reports are short, so usage is scaled up to resemble that of a full report.
	const inputTokens = Math.ceil(((system.length + user.length) / 4) * 3) + (isEditor ? 0 : 9000);
	const outputTokens = Math.ceil(reply.text.length / 4) * 9;
	const cost =
		inputTokens * Number(model.pricing.prompt) +
		outputTokens * Number(model.pricing.completion) +
		(isEditor ? 0 : 0.007);

	res.writeHead(200, { 'Content-Type': 'text/event-stream' });
	res.write(': OPENROUTER PROCESSING\n\n');
	const chunk = (delta, extra = {}) =>
		res.write(`data: ${JSON.stringify({ id: 'gen-mock', choices: [{ index: 0, delta, finish_reason: null }], ...extra })}\n\n`);

	if (!isEditor) await sleep(DELAY * 20);
	if (key.startsWith('sk-or-v1-blank')) {
		res.write(`data: ${JSON.stringify({ id: 'gen-mock', choices: [{ index: 0, delta: { content: '' }, finish_reason: 'length' }], usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, cost: 0.02 } })}\n\n`);
		res.write('data: [DONE]\n\n');
		return res.end();
	}
	if (key.startsWith('sk-or-v1-cutoff')) {
		chunk({ role: 'assistant', content: 'A report that stops suddenly ' });
		return res.end();
	}
	const allWords = reply.text.match(/\S+\s*/g) ?? [];
	const stoppedShort = key.startsWith('sk-or-v1-length') && !isEditor;
	const words = stoppedShort ? allWords.slice(0, 12) : allWords;
	let sent = 0;
	for (const word of words) {
		if (key.startsWith('sk-or-v1-midfail') && !isEditor && ++sent > 8) {
			res.write(`data: ${JSON.stringify({ error: { code: 'server_error', message: 'Provider disconnected unexpectedly' }, choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }] })}\n\n`);
			res.write('data: [DONE]\n\n');
			return res.end();
		}
		chunk({ role: 'assistant', content: word });
		if (!isEditor) await sleep(DELAY);
	}
	if (reply.sources.length) {
		chunk({
			content: '',
			annotations: reply.sources.map((s) => ({ type: 'url_citation', url_citation: { url: s.url, title: s.title } }))
		});
	}
	res.write(`data: ${JSON.stringify({ id: 'gen-mock', choices: [{ index: 0, delta: { content: '' }, finish_reason: stoppedShort ? 'length' : 'stop' }], usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens, cost } })}\n\n`);
	res.write('data: [DONE]\n\n');
	res.end();
}).listen(PORT, '127.0.0.1', () => {
	if (!process.env.MOCK_QUIET) console.log(`Stand-in for OpenRouter listening on ${PORT}.`);
});
