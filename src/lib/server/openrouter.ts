import { costMicro, estimateTokens, MAX_RESEARCH_TOKENS, toMicro, WEB_SEARCH_MICRO, type Pricing } from '#lib/budget.ts';
import { config } from './env.ts';
import { scrub } from './crypto.ts';

export class OpenRouterError extends Error {
	/** True once text has arrived: the attempt may have been charged, so it is not repeated. */
	partial = false;
	constructor(
		public status: number,
		message: string,
		public retryAfterMs?: number
	) {
		super(scrub(message));
	}
}

const headers = (key?: string): Record<string, string> => ({
	...(key ? { Authorization: `Bearer ${key}` } : {}),
	'Content-Type': 'application/json',
	'HTTP-Referer': process.env.ORIGIN || 'http://localhost:3000',
	'X-Title': 'OpenResearch'
});

function retryAfter(res: Response): number | undefined {
	const value = Number(res.headers.get('retry-after'));
	return Number.isFinite(value) && value > 0 ? value * 1000 : undefined;
}

async function errorFrom(res: Response): Promise<OpenRouterError> {
	let message = `OpenRouter returned status ${res.status}.`;
	try {
		const body = (await res.json()) as { error?: { message?: string } };
		if (body.error?.message) message = body.error.message;
	} catch {
		/* The status alone has to do. */
	}
	return new OpenRouterError(res.status, message, retryAfter(res));
}

export type KeyInfo = {
	limitMicro: number | null;
	remainingMicro: number | null;
	usageMicro: number;
	limitReset: string | null;
	isFreeTier: boolean;
};

export async function checkKey(key: string): Promise<KeyInfo> {
	const res = await fetch(`${config.openRouterBase}/key`, {
		headers: headers(key),
		signal: AbortSignal.timeout(15_000)
	});
	if (!res.ok) throw await errorFrom(res);
	const { data } = (await res.json()) as {
		data: {
			limit: number | null;
			limit_remaining: number | null;
			limit_reset: string | null;
			usage: number;
			is_free_tier: boolean;
		};
	};
	return {
		limitMicro: data.limit == null ? null : toMicro(data.limit),
		remainingMicro: data.limit_remaining == null ? null : toMicro(data.limit_remaining),
		usageMicro: toMicro(data.usage ?? 0),
		limitReset: data.limit_reset ?? null,
		isFreeTier: Boolean(data.is_free_tier)
	};
}

/**
 * The page on OpenRouter where a visitor approves a key for this site, so that nothing has to be copied.
 * No registration with OpenRouter is involved: the site is known to it by the address it is sent back to.
 */
export function connectUrl(callbackUrl: string, challenge: string, state: string): string {
	const url = new URL('/auth', new URL(config.openRouterBase).origin);
	url.search = new URLSearchParams({
		callback_url: callbackUrl,
		code_challenge: challenge,
		code_challenge_method: 'S256',
		state,
		key_label: 'OpenResearch'
	}).toString();
	return url.toString();
}

/** Exchanges the code that OpenRouter sent back for the key it has created. The code is good for ten minutes, once. */
export async function exchangeCode(code: string, verifier: string): Promise<string> {
	const res = await fetch(`${config.openRouterBase}/auth/keys`, {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
		signal: AbortSignal.timeout(15_000)
	});
	if (!res.ok) throw await errorFrom(res);
	const body = (await res.json()) as { key?: unknown };
	if (typeof body.key !== 'string') throw new OpenRouterError(502, 'OpenRouter did not return a key.');
	return body.key;
}

export type Model = {
	id: string;
	name: string;
	contextLength: number;
	pricing: Pricing;
	/** Set where the model accepts it, because reasoning is taken out of the same allowance as the reply. */
	lowEffort?: boolean;
};

let modelCache: { at: number; models: Model[] } | undefined;
const MODEL_TTL = 60 * 60 * 1000;
const MODEL_RETRY = 10_000;
let modelRequest: Promise<Model[]> | undefined;
let modelFailedAt = 0;

/** Anyone can cause this request, so it is shared, and it is not repeated while OpenRouter is down. */
export async function listModels(): Promise<Model[]> {
	if (modelCache && Date.now() - modelCache.at < MODEL_TTL) return modelCache.models;
	if (Date.now() - modelFailedAt < MODEL_RETRY) {
		if (modelCache) return modelCache.models;
		throw new OpenRouterError(503, 'The list of models could not be loaded.');
	}
	modelRequest ??= fetchModels().finally(() => {
		modelRequest = undefined;
	});
	return modelRequest;
}

async function fetchModels(): Promise<Model[]> {
	try {
		const res = await fetch(`${config.openRouterBase}/models`, {
			headers: headers(),
			signal: AbortSignal.timeout(15_000)
		});
		if (!res.ok) throw await errorFrom(res);
		const { data } = (await res.json()) as {
			data: {
				id: string;
				name: string;
				context_length: number;
				architecture?: { output_modalities?: string[] };
				pricing: { prompt: string; completion: string; request?: string };
				top_provider?: { max_completion_tokens?: number | null };
				supported_parameters?: string[];
				reasoning?: { supported_efforts?: string[] };
			}[];
		};
		const models = data
			.filter((m) => {
				const out = m.architecture?.output_modalities;
				const textOnly = !out || (out.length === 1 && out[0] === 'text');
				// A model that cannot write a full report, or cannot be held to a length, cannot be budgeted for.
				const longEnough = (m.top_provider?.max_completion_tokens ?? Infinity) >= MAX_RESEARCH_TOKENS;
				const params = m.supported_parameters;
				const limitable = !params || params.includes('max_tokens') || params.includes('max_completion_tokens');
				return (
					textOnly &&
					longEnough &&
					limitable &&
					!m.id.endsWith(':free') &&
					!m.id.endsWith(':batch') &&
					Number(m.pricing?.prompt) > 0 &&
					Number(m.pricing?.completion) > 0 &&
					m.context_length >= 32_000
				);
			})
			.map((m) => ({
				id: m.id,
				name: m.name,
				contextLength: m.context_length,
				pricing: {
					prompt: Number(m.pricing.prompt),
					completion: Number(m.pricing.completion),
					request: Number(m.pricing.request ?? 0)
				},
				lowEffort: m.reasoning?.supported_efforts?.includes('low') ?? false
			}));
		modelCache = { at: Date.now(), models };
		return models;
	} catch (err) {
		modelFailedAt = Date.now();
		if (modelCache) return modelCache.models;
		throw err;
	}
}

export async function findModel(id: string): Promise<Model | undefined> {
	return (await listModels()).find((m) => m.id === id);
}

export type Source = { url: string; title: string };

export type ChatResult = {
	text: string;
	inputTokens: number;
	outputTokens: number;
	costMicro: number;
	sources: Source[];
	finishReason: string | null;
};

type ChatOptions = {
	key: string;
	model: string;
	pricing: Pricing;
	/** Keeps reasoning brief. At a model's default it can use most of the allowance before any text. */
	lowEffort?: boolean;
	system: string;
	user: string;
	maxTokens: number;
	web?: boolean;
	signal?: AbortSignal;
	onDelta?: (text: string) => void;
};

/** Reasoning models may stay silent for some time. Keep-alive comments do not count as progress. */
const IDLE_TIMEOUT = 300_000;
const TOTAL_TIMEOUT = 1_200_000;

function collectAnnotations(list: unknown, into: Map<string, Source>) {
	if (!Array.isArray(list)) return;
	for (const a of list as Record<string, any>[]) {
		const cite = a?.url_citation ?? a;
		if (typeof cite?.url === 'string' && /^https?:\/\//i.test(cite.url)) {
			into.set(cite.url, { url: cite.url, title: String(cite.title || cite.url).slice(0, 240) });
		}
	}
}

/** One streamed completion. Cost is taken from OpenRouter's own figure wherever it is supplied. */
export async function chat(opts: ChatOptions): Promise<ChatResult> {
	const idle = new AbortController();
	let timer = setTimeout(() => idle.abort(), IDLE_TIMEOUT);
	const touch = () => {
		clearTimeout(timer);
		timer = setTimeout(() => idle.abort(), IDLE_TIMEOUT);
	};
	const deadline = AbortSignal.timeout(TOTAL_TIMEOUT);
	const signal = AbortSignal.any([idle.signal, deadline, ...(opts.signal ? [opts.signal] : [])]);
	let text = '';
	/** Set once OpenRouter has accepted the request, after which the attempt may be billed. */
	let accepted = false;

	try {
		const res = await fetch(`${config.openRouterBase}/chat/completions`, {
			method: 'POST',
			headers: headers(opts.key),
			signal,
			body: JSON.stringify({
				model: opts.model,
				stream: true,
				max_tokens: opts.maxTokens,
				reasoning: opts.lowEffort ? { effort: 'low', exclude: true } : { exclude: true },
				...(opts.web ? { plugins: [{ id: 'web', engine: 'exa', max_results: 6 }] } : {}),
				messages: [
					{ role: 'system', content: opts.system },
					{ role: 'user', content: opts.user }
				]
			})
		});
		if (!res.ok) throw await errorFrom(res);
		if (!res.body) throw new OpenRouterError(502, 'OpenRouter returned an empty response.');
		accepted = true;

		const sources = new Map<string, Source>();
		const decoder = new TextDecoder();
		let buffer = '';
		let finishReason: string | null = null;
		let usage: Record<string, any> | undefined;

		const handleLine = (line: string) => {
			if (!line.startsWith('data:')) return; // Comment lines are keep-alives.
			touch();
			const payload = line.slice(5).trim();
			if (!payload || payload === '[DONE]') return;
			let chunk: Record<string, any>;
			try {
				chunk = JSON.parse(payload);
			} catch {
				return;
			}
			if (chunk.error) {
				const code = Number(chunk.error.code);
				throw new OpenRouterError(
					Number.isFinite(code) && code >= 400 ? code : 502,
					String(chunk.error.message ?? 'The model stopped with an error.')
				);
			}
			const choice = chunk.choices?.[0];
			const delta = choice?.delta;
			if (typeof delta?.content === 'string' && delta.content) {
				text += delta.content;
				opts.onDelta?.(delta.content);
			}
			collectAnnotations(delta?.annotations, sources);
			collectAnnotations(choice?.message?.annotations, sources);
			if (choice?.finish_reason) finishReason = choice.finish_reason;
			if (chunk.usage) usage = chunk.usage;
		};

		const reader = res.body.getReader();
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let index: number;
			while ((index = buffer.indexOf('\n')) >= 0) {
				handleLine(buffer.slice(0, index).trim());
				buffer = buffer.slice(index + 1);
			}
		}
		if (buffer.trim()) handleLine(buffer.trim());

		// A stream that closes without finishing has not delivered what it was asked for.
		if (!finishReason) {
			const ended = new OpenRouterError(502, 'The stream ended before the model had finished.');
			ended.partial = true;
			throw ended;
		}

		const inputTokens = Number(usage?.prompt_tokens ?? 0) || estimateTokens(opts.system + opts.user);
		const outputTokens = Number(usage?.completion_tokens ?? 0) || estimateTokens(text);
		const reported = usage?.cost;
		return {
			text,
			inputTokens,
			outputTokens,
			costMicro:
				typeof reported === 'number' && reported >= 0
					? toMicro(reported)
					: costMicro(inputTokens, outputTokens, opts.pricing) + (opts.web ? WEB_SEARCH_MICRO : 0),
			sources: [...sources.values()],
			finishReason
		};
	} catch (err) {
		const failure =
			err instanceof OpenRouterError
				? err
				: idle.signal.aborted || deadline.aborted
					? new OpenRouterError(408, 'The model stopped sending data.')
					: opts.signal?.aborted
						? new OpenRouterError(499, 'The request was stopped.')
						: accepted
							? new OpenRouterError(502, 'The connection was lost during the reply.')
							: err;
		if (failure instanceof OpenRouterError) {
			// An error sent in the stream before any text means nothing was generated. A connection lost
			// after the request was accepted may have been billed, even if the model had only been reasoning.
			failure.partial = failure.partial || text.length > 0 || (accepted && !(err instanceof OpenRouterError));
		}
		throw failure;
	} finally {
		clearTimeout(timer);
	}
}
