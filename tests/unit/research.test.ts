import { describe, expect, it } from 'vitest';
import { extractLinks, isNoNewFindings, parseEdited, withSources } from '../../src/lib/server/research.ts';

describe('reading model replies', () => {
	it('reads the edited document and questions', () => {
		const out = parseEdited('<findings>\nThe answer.\n</findings>\n<questions>\n- First?\n* Second?\n3. Third?\n</questions>');
		expect(out).toEqual({ findings: 'The answer.', questions: ['First?', 'Second?', 'Third?'] });
	});
	it('accepts an empty list of questions', () => {
		expect(parseEdited('<findings>A</findings><questions></questions>')?.questions).toEqual([]);
	});
	it('accepts a reply cut off inside the questions', () => {
		expect(parseEdited('<findings>A</findings><questions>\n- One?')?.questions).toEqual(['One?']);
	});
	it('returns null when the document is missing', () => {
		expect(parseEdited('Sorry, no.')).toBeNull();
		expect(parseEdited('<findings></findings>')).toBeNull();
		expect(parseEdited('<findings>cut off without an end')).toBeNull();
	});
	it('limits the number of questions to five', () => {
		const list = Array.from({ length: 9 }, (_, i) => `- Question ${i}?`).join('\n');
		expect(parseEdited(`<findings>A</findings><questions>${list}</questions>`)?.questions).toHaveLength(5);
	});
	it('recognises a reply with nothing new', () => {
		expect(isNoNewFindings('NO NEW FINDINGS')).toBe(true);
		expect(isNoNewFindings(' **No new findings.** ')).toBe(true);
		expect(isNoNewFindings('No new findings were made about X, but Y is known.')).toBe(false);
	});
	it('appends only sources not already cited', () => {
		const report = 'See [a](https://a.example/).';
		const out = withSources(report, [
			{ url: 'https://a.example/', title: 'A' },
			{ url: 'https://b.example/', title: 'B [x]' }
		]);
		expect(out).toContain('## Sources');
		expect(out).toContain('[B x](https://b.example/)');
		expect(out.match(/a\.example/g)).toHaveLength(1);
	});
	it('extracts links', () => {
		expect(extractLinks('[a](https://a.example/x) [b](http://b.example) [c](https://a.example/x)')).toEqual([
			'https://a.example/x',
			'http://b.example'
		]);
	});
});

describe('hostile replies from the editor', () => {
	const quick = (text: string) => {
		const started = performance.now();
		const result = parseEdited(text);
		expect(performance.now() - started).toBeLessThan(50);
		return result;
	};

	it('are read in a single pass, however they are built', () => {
		const space = ' \n'.repeat(50_000);
		expect(quick(`<findings>${space}`)).toBeNull();
		expect(quick(`<findings>${space}</findings>`)).toBeNull();
		expect(quick(`<findings>Text${space}</findings><questions>${space}`)).toEqual({ findings: 'Text', questions: [] });
		expect(quick('<findings>'.repeat(20_000))).toBeNull();
	});

	it('do not replace the findings when they stop before the closing tag', () => {
		expect(quick('<findings>Half of a document')).toBeNull();
	});

	it('still read a normal reply', () => {
		expect(quick('<FINDINGS>\nThe answer.\n</FINDINGS>\n<questions>\n- What next?\n</questions>')).toEqual({
			findings: 'The answer.',
			questions: ['What next?']
		});
	});
});
