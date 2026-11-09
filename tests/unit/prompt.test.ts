import { describe, expect, it } from 'vitest';
import { checkPrompt, countWords, freeSlug, MAX_CHARS, slugFromPrompt, titleFromPrompt } from '../../src/lib/prompt.ts';

const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');

describe('prompt rules', () => {
	it('counts words across any whitespace', () => {
		expect(countWords('')).toBe(0);
		expect(countWords('   ')).toBe(0);
		expect(countWords('one  two\nthree\tfour')).toBe(4);
	});
	it('accepts exactly 250 words and rejects 251', () => {
		expect(checkPrompt(words(250)).ok).toBe(true);
		const over = checkPrompt(words(251));
		expect(over.ok).toBe(false);
		if (!over.ok) expect(over.message).toContain('251');
	});
	it('rejects empty and non-string input', () => {
		expect(checkPrompt('   ').ok).toBe(false);
		expect(checkPrompt(null).ok).toBe(false);
		expect(checkPrompt(42).ok).toBe(false);
	});
	it('rejects one enormous word', () => {
		expect(checkPrompt('x'.repeat(MAX_CHARS + 1)).ok).toBe(false);
	});
	it('rejects control characters, which git cannot store', () => {
		expect(checkPrompt('A prompt with a nul\u0000 in it').ok).toBe(false);
		expect(checkPrompt('A prompt with a bell\u0007 in it').ok).toBe(false);
		expect(checkPrompt('Line one\nLine two\tindented').ok).toBe(true);
	});
	it('normalises line endings and trims', () => {
		const out = checkPrompt('  a\r\nb  ');
		expect(out).toEqual({ ok: true, prompt: 'a\nb' });
	});
});

describe('titles and slugs', () => {
	it('takes the first sentence as the title', () => {
		expect(titleFromPrompt('What is the effect of rain? It may vary.')).toBe('What is the effect of rain?');
	});
	it('shortens very long titles at a word', () => {
		const title = titleFromPrompt(words(100));
		expect(title.length).toBeLessThanOrEqual(198);
		expect(title.endsWith('…')).toBe(true);
	});
	it('builds a safe slug', () => {
		expect(slugFromPrompt('Café: rock & roll?! ../../etc/passwd', 'abc123')).toMatch(/^[a-z0-9-]+-abc123$/);
		expect(slugFromPrompt('水はどこから来るのか', 'abc123')).toBe('abc123');
		expect(slugFromPrompt('- a list item first', 'abc123')).toBe('a-list-item-first-abc123');
		expect(slugFromPrompt('--- ---', 'abc123')).toMatch(/^[a-z0-9]/);
	});
});

describe('slugs already in use', () => {
	const suffixes = (...list: string[]) => () => list.shift() ?? 'ffffff';

	it('are passed over for another', () => {
		const taken = new Set(['abc123']);
		expect(freeSlug('水はどこから来るのか', (s) => taken.has(s), suffixes('abc123', 'abc123', 'def456'))).toBe('def456');
		expect(freeSlug('Rain and rivers', (s) => s === 'rain-and-rivers-abc123', suffixes('abc123', 'def456'))).toBe('rain-and-rivers-def456');
	});
	it('give up rather than reuse one', () => {
		expect(freeSlug('水はどこから来るのか', () => true, () => 'abc123')).toBeNull();
	});
});
