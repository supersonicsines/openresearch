import { describe, expect, it } from 'vitest';
import { renderMarkdown, standaloneHtml } from '../../src/lib/server/render.ts';

describe('rendering model output', () => {
	const hostile = [
		'<script>alert(1)</script>',
		'<img src=x onerror=alert(1)>',
		'<svg onload=alert(1)></svg>',
		'<iframe src="https://evil.example"></iframe>',
		'<a href="javascript:alert(1)">x</a>',
		'[x](javascript:alert(1))',
		'[x](data:text/html;base64,PHNjcmlwdD4=)',
		'<a href="//evil.example">x</a>',
		'<style>body{display:none}</style>',
		'<form action="https://evil.example"><input></form>',
		'<p style="position:fixed" onclick="alert(1)">x</p>',
		'<details open ontoggle=alert(1)>x</details>',
		'<object data="x"></object><embed src="x">',
		'![tracker](https://evil.example/pixel.png)'
	];
	for (const input of hostile) {
		it(`neutralises ${input.slice(0, 40)}`, () => {
			const html = renderMarkdown(input);
			expect(html).not.toMatch(/<(script|img|svg|iframe|style|form|input|object|embed|details)\b/i);
			expect(html).not.toMatch(/\bon\w+\s*=/i);
			expect(html).not.toMatch(/javascript:|data:text|style=/i);
			expect(html).not.toMatch(/href="\/\//);
		});
	}
	it('keeps ordinary documents intact', () => {
		const html = renderMarkdown('## Heading\n\nSome **bold** text with a [link](https://example.org/a).\n\n| a | b |\n|---|---|\n| 1 | 2 |');
		expect(html).toContain('<h2>Heading</h2>');
		expect(html).toContain('<strong>bold</strong>');
		expect(html).toContain('<table>');
		expect(html).toContain('href="https://example.org/a"');
		expect(html).toContain('rel="nofollow noopener noreferrer ugc"');
	});
	it('escapes the title of a standalone page', () => {
		const page = standaloneHtml('<script>x</script>', '<p>ok</p>', 'note');
		expect(page).not.toContain('<script>');
		expect(page).toContain('&#60;script&#62;');
	});
});

describe('text that cannot be parsed', () => {
	it('is kept as plain text rather than lost', () => {
		const deep = '> '.repeat(16_000) + 'kept <script>alert(1)</script>';
		const html = renderMarkdown(deep);
		expect(html).toContain('kept');
		expect(html).not.toContain('<script');
	});
});
