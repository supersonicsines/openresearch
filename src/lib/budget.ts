// Spending arithmetic. All amounts are integer millionths of a US dollar ("micro").

export type Pricing = {
	/** Dollars per input token. */
	prompt: number;
	/** Dollars per output token. */
	completion: number;
	/** Dollars per request, where a model charges one. */
	request: number;
};

/** Web search through Exa, per OpenRouter's published price of $0.007 per request. */
export const WEB_SEARCH_MICRO = 7_000;
export const MIN_DONATION_MICRO = 100_000;
export const MAX_RUNS_PER_DONATION = 40;
export const MAX_RESEARCH_TOKENS = 8_000;
export const MAX_EDITOR_TOKENS = 8_000;
/**
 * Below this, a model cannot write anything of use. Reasoning is taken out of the same allowance,
 * and some providers will not reason on fewer than 1,024 tokens.
 */
export const MIN_OUTPUT_TOKENS = 2_000;
/** Allowance for the search results that OpenRouter adds to a research prompt. */
export const SEARCH_RESULT_TOKENS = 10_000;

export function toMicro(dollars: number): number {
	return Math.round(dollars * 1_000_000);
}

export function estimateTokens(text: string): number {
	// A cautious figure: most English prose comes to about four characters per token.
	return Math.ceil(text.length / 3.5);
}

export function inputCostMicro(tokens: number, pricing: Pricing): number {
	return Math.ceil(tokens * pricing.prompt * 1_000_000 + pricing.request * 1_000_000);
}

export function costMicro(input: number, output: number, pricing: Pricing): number {
	return Math.ceil(
		(input * pricing.prompt + output * pricing.completion + pricing.request) * 1_000_000
	);
}

/** The most that a single run may spend from a donation. */
export function runBudgetMicro(amountMicro: number, remainingMicro: number): number {
	return Math.min(remainingMicro, Math.max(500_000, Math.floor(amountMicro / 4)));
}

/** The largest output that can be afforded, or 0 if it would be too small to be of use. */
export function affordableOutputTokens(
	budgetMicro: number,
	inputTokens: number,
	pricing: Pricing,
	ceiling: number,
	extraMicro = 0
): number {
	const left = budgetMicro - inputCostMicro(inputTokens, pricing) - extraMicro;
	if (left <= 0) return 0;
	const perToken = pricing.completion * 1_000_000;
	const tokens = perToken > 0 ? Math.floor(left / perToken) : ceiling;
	const capped = Math.min(tokens, ceiling);
	return capped < MIN_OUTPUT_TOKENS ? 0 : capped;
}

/**
 * The smallest amount that can pay for a run's first step, which is the search and the report.
 * That step may use 70% of a run's budget, and the rest is kept for updating the findings.
 */
export function minimumRunMicro(pricing: Pricing): number {
	const research = costMicro(SEARCH_RESULT_TOKENS + 1_500, MIN_OUTPUT_TOKENS, pricing) + WEB_SEARCH_MICRO;
	return Math.ceil(research / 0.7);
}

/** The smallest donation that will be accepted for a model. */
export function minimumDonationMicro(pricing: Pricing): number {
	return Math.max(MIN_DONATION_MICRO, minimumRunMicro(pricing));
}

/** A typical run, for the estimate shown before a donation is made. */
export function typicalRunMicro(pricing: Pricing): number {
	return WEB_SEARCH_MICRO + costMicro(12_000, 3_000, pricing) + costMicro(8_000, 3_000, pricing);
}

export function estimateRuns(amountMicro: number, pricing: Pricing): number {
	const typical = typicalRunMicro(pricing);
	if (typical <= 0) return 0;
	return Math.min(MAX_RUNS_PER_DONATION, Math.floor(amountMicro / typical));
}
