import { describe, expect, it } from 'vitest';
import { milestone, money, place, wholeMoney, plural, reference, shortAgo, shortModelName, standing, timeAgo } from '../../src/lib/format.ts';

describe('place', () => {
	it('is written in words up to tenth, and in figures after that', () => {
		expect(place(1)).toBe('first');
		expect(place(10)).toBe('tenth');
		const figures = [11, 12, 13, 20, 21, 22, 23, 24, 101, 111, 112, 121].map(place);
		expect(figures).toEqual(['11th', '12th', '13th', '20th', '21st', '22nd', '23rd', '24th', '101st', '111th', '112th', '121st']);
	});
});

describe('standing', () => {
	const board = [520_000, 160_000, 140_000];

	it('states the lead and the distance to the place above', () => {
		expect(standing(board, 0)).toBe('In the lead by $0.36.');
		expect(standing(board, 1)).toBe('$0.36 short of first place.');
		expect(standing(board, 2)).toBe('$0.02 short of second place.');
	});

	it('agrees with the rounded figures shown beside it', () => {
		// These are shown as $0.16 and $0.14. The exact difference would be shown as $0.03.
		expect(standing([164_900, 135_100], 1)).toBe('$0.02 short of first place.');
	});

	it('says so when entries are level', () => {
		expect(standing([240_000, 240_000], 0)).toBe('Level with second place.');
		expect(standing([240_000, 240_000], 1)).toBe('Level with first place.');
	});

	it('uses words for a difference too small to be shown', () => {
		expect(standing([141_000, 140_000], 0)).toBe('Narrowly in the lead.');
		expect(standing([141_000, 140_000], 1)).toBe('Nearly level with first place.');
		expect(standing([5_000, 4_500], 1)).toBe('Nearly level with first place.');
	});

	it('does not claim a lead over nothing', () => {
		expect(standing([100_000], 0)).toBe('');
		expect(standing([100_000, 0], 0)).toBe('');
		expect(standing([100_000, 0], 1)).toBe('Not yet funded.');
		expect(standing([0, 0], 0)).toBe('Not yet funded.');
		expect(standing([0, 0], 1)).toBe('Not yet funded.');
	});

	it('handles amounts of less than a cent', () => {
		expect(standing([12_000, 4_200], 1)).toBe('$0.006 short of first place.');
	});
});

describe('format', () => {
	it('formats money', () => {
		expect(money(0)).toBe('$0.00');
		expect(money(5_000_000)).toBe('$5.00');
		expect(money(1_234_500_000)).toBe('$1,234.50');
		expect(money(4_000)).toBe('$0.004');
	});
	it('forms plurals', () => {
		expect(plural(1, 'run')).toBe('1 run');
		expect(plural(2, 'run')).toBe('2 runs');
		expect(plural(0, 'donor')).toBe('0 donors');
	});
	it('describes time', () => {
		const now = 1_800_000_000_000;
		expect(timeAgo(now - 5_000, now)).toBe('just now');
		expect(timeAgo(now - 3_600_000, now)).toBe('1 hour ago');
		expect(timeAgo(now - 3 * 86_400_000, now)).toBe('3 days ago');
	});
	it('removes the provider from model names', () => {
		expect(shortModelName('Anthropic: Claude Sonnet 5.5')).toBe('Claude Sonnet 5.5');
		expect(shortModelName('Plain')).toBe('Plain');
	});
});

describe('references and milestones', () => {
	it('gives each project a short reference', () => {
		expect(reference(7)).toBe('OS-0007');
		expect(reference(12345)).toBe('OS-12345');
	});
	it('finds the next round figure above an amount', () => {
		expect(milestone(0)).toBe(1_000_000);
		expect(milestone(999_999)).toBe(1_000_000);
		expect(milestone(1_000_000)).toBe(5_000_000);
		expect(milestone(30_000_000)).toBe(100_000_000);
		expect(milestone(9_999_000_000_000)).toBe(250_000_000_000);
	});
	it('writes round figures without their cents', () => {
		expect(wholeMoney(1_000_000)).toBe('$1');
		expect(wholeMoney(2_500_000_000)).toBe('$2,500');
		expect(wholeMoney(250_000_000_000)).toBe('$250,000');
	});
	it('shortens ages', () => {
		const now = 1_800_000_000_000;
		expect(shortAgo(now - 5_000, now)).toBe('5s');
		expect(shortAgo(now - 120_000, now)).toBe('2m');
		expect(shortAgo(now - 5 * 3_600_000, now)).toBe('5h');
		expect(shortAgo(now - 3 * 86_400_000, now)).toBe('3d');
		expect(shortAgo(now - 21 * 86_400_000, now)).toBe('3w');
	});
});
