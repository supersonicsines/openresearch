import { describe, expect, it } from 'vitest';
import {
	affordableOutputTokens,
	costMicro,
	estimateRuns,
	MAX_RESEARCH_TOKENS,
	MAX_RUNS_PER_DONATION,
	minimumRunMicro,
	runBudgetMicro,
	type Pricing
} from '../../src/lib/budget.ts';

const sonnet: Pricing = { prompt: 2 / 1e6, completion: 10 / 1e6, request: 0 };
const cheap: Pricing = { prompt: 0.04 / 1e6, completion: 0.5 / 1e6, request: 0 };

describe('budgets', () => {
	it('prices tokens correctly', () => {
		expect(costMicro(1_000_000, 0, sonnet)).toBe(2_000_000);
		expect(costMicro(0, 1_000_000, sonnet)).toBe(10_000_000);
	});
	it('never lets a run exceed what remains', () => {
		expect(runBudgetMicro(1_000_000, 200_000)).toBe(200_000);
		expect(runBudgetMicro(100_000_000, 100_000_000)).toBe(25_000_000);
		expect(runBudgetMicro(1_000_000, 1_000_000)).toBe(500_000);
	});
	it('keeps the output affordable within the budget', () => {
		const tokens = affordableOutputTokens(100_000, 5_000, sonnet, MAX_RESEARCH_TOKENS, 7_000);
		const worst = costMicro(5_000, tokens, sonnet) + 7_000;
		expect(tokens).toBeGreaterThan(0);
		expect(worst).toBeLessThanOrEqual(100_000);
	});
	it('returns zero when too little is left to be of use', () => {
		expect(affordableOutputTokens(1_000, 5_000, sonnet, MAX_RESEARCH_TOKENS)).toBe(0);
		expect(affordableOutputTokens(10_900, 0, sonnet, MAX_RESEARCH_TOKENS, 7_000)).toBe(0);
	});
	it('respects the ceiling', () => {
		expect(affordableOutputTokens(50_000_000, 100, cheap, MAX_RESEARCH_TOKENS)).toBe(MAX_RESEARCH_TOKENS);
	});
	it('estimates runs, up to the limit per donation', () => {
		expect(estimateRuns(1_000_000, sonnet)).toBeGreaterThan(0);
		expect(estimateRuns(1_000_000_000, cheap)).toBe(MAX_RUNS_PER_DONATION);
	});
	it('always charges something for a run, so that a donation cannot loop forever', () => {
		expect(minimumRunMicro({ prompt: 0, completion: 0, request: 0 })).toBeGreaterThan(0);
	});
});
