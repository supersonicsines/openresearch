import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

/** Model output is untrusted. Only plain document elements and web links are allowed through. */
const OPTIONS: sanitizeHtml.IOptions = {
	allowedTags: [
		'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'ul', 'ol', 'li', 'blockquote',
		'strong', 'em', 'b', 'i', 'del', 'sub', 'sup', 'code', 'pre', 'a',
		'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption'
	],
	allowedAttributes: {
		a: ['href', 'rel', 'target'],
		th: ['align', 'colspan', 'rowspan', 'scope'],
		td: ['align', 'colspan', 'rowspan'],
		ol: ['start']
	},
	allowedSchemes: ['http', 'https'],
	allowedSchemesAppliedToAttributes: ['href'],
	allowProtocolRelative: false,
	disallowedTagsMode: 'discard',
	transformTags: {
		a: (tagName, attribs) => ({
			tagName,
			attribs: {
				...(attribs.href ? { href: attribs.href } : {}),
				rel: 'nofollow noopener noreferrer ugc',
				target: '_blank'
			}
		})
	}
};

function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function renderMarkdown(md: string): string {
	try {
		const html = marked.parse(md, { async: false, gfm: true, breaks: false }) as string;
		return sanitizeHtml(html, OPTIONS);
	} catch {
		// Very deep nesting exhausts the stack. The run has been paid for, so its text is kept as it stands.
		return `<pre>${escapeHtml(md)}</pre>`;
	}
}

/** The plain text of a heading, for a place where markup is of no use. */
function plain(text: string): string {
	return text.replace(/[*_`~\[\]]/g, '').replace(/\s+/g, ' ').trim();
}

export type Section = { title: string; html: string; sources: number };

/**
 * Divides a findings document at its headings. What comes before the first of them is the answer as
 * it stands. Only headings at the top level of the document divide it: one inside a list or a
 * quotation is left where it is.
 *
 * The editor is asked for "## " headings, but a model may use another level, and documents written
 * before the rule did. So the document is divided at the highest level of heading that it uses more
 * than once, which also leaves a single title above the sections where there is one.
 */
export function sections(md: string): { lead: string; sections: Section[] } {
	const tokens = marked.lexer(md, { gfm: true, breaks: false });
	const used = new Map<number, number>();
	for (const token of tokens) if (token.type === 'heading') used.set(token.depth, (used.get(token.depth) ?? 0) + 1);
	const levels = [...used.keys()].sort((a, b) => a - b);
	const level = levels.find((depth) => (used.get(depth) ?? 0) > 1) ?? levels[0];
	const groups: { title: string; raw: string }[] = [];
	let lead = '';
	for (const token of tokens) {
		if (token.type === 'heading' && token.depth === level) groups.push({ title: plain(token.text), raw: '' });
		else if (groups.length) groups[groups.length - 1].raw += token.raw;
		else lead += token.raw;
	}
	return {
		lead: lead.trim() ? renderMarkdown(lead) : '',
		sections: groups.map(({ title, raw }) => {
			const html = renderMarkdown(raw);
			return { title: title || 'Untitled section', html, sources: html.split('<a ').length - 1 };
		})
	};
}

/**
 * The findings as they are shown: the answer, then each section under a heading that opens and closes.
 * The wrappers are written here, around text that has already been made safe, so the model has no say in them.
 */
export function renderFindings(md: string): string {
	let parts;
	try {
		parts = sections(md);
	} catch {
		return renderMarkdown(md);
	}
	if (parts.sections.length === 0) return parts.lead;
	const body = parts.sections
		.map(
			(section, i) =>
				`<details class="section" id="section-${i + 1}"><summary><h2>${escapeHtml(section.title)}</h2>` +
				(section.sources ? `<span class="count">${section.sources} ${section.sources === 1 ? 'source' : 'sources'}</span>` : '') +
				`</summary><div class="section-body">${section.html}</div></details>`
		)
		.join('\n');
	return `${parts.lead}\n<div class="sections">\n${body}\n</div>`;
}

const DOCUMENT_CSS = `
:root{color-scheme:light dark}
body{margin:0 auto;padding:3rem 1.25rem 5rem;max-width:40rem;font:1.125rem/1.65 "Source Serif 4",Georgia,serif;color:#17181a;background:#fff}
h1,h2,h3{font-weight:500;line-height:1.25;letter-spacing:-.005em;margin:2.2em 0 .6em}
h1{font-size:1.9rem;margin-top:0}h2{font-size:1.45rem}h3{font-size:1.2rem}
a{color:#1c3f6e;text-underline-offset:.15em}
blockquote{margin:1.4em 0;padding-left:1.1em;border-left:2px solid #d9d9d6;color:#4d4f53}
table{border-collapse:collapse;width:100%;font-size:.95em}th,td{padding:.45em .7em;border-bottom:1px solid #e6e6e3;text-align:left}
code,pre{font-family:ui-monospace,Menlo,monospace;font-size:.88em}pre{overflow:auto;padding:1em;background:#f5f5f3;border-radius:6px}
details.section{border-top:1px solid #e6e6e3}details.section:last-child{border-bottom:1px solid #e6e6e3}
summary{display:flex;align-items:baseline;justify-content:space-between;gap:1em;padding:.7em 0;cursor:pointer}
summary h2{margin:0;font-size:1.25rem}summary .count{flex:none;font:.8rem ui-monospace,Menlo,monospace;color:#5f6165}
.section-body{padding-bottom:1em}
footer{margin-top:3.5em;padding-top:1em;border-top:1px solid #e6e6e3;font-size:.875rem;color:#5f6165}
@media (prefers-color-scheme:dark){body{color:#ececea;background:#161719}a{color:#a9c1e6}details.section,details.section:last-child{border-color:#2c2d30}summary .count{color:#a3a4a6}blockquote{color:#b3b4b6;border-color:#35363a}th,td,footer{border-color:#2c2d30}footer{color:#a3a4a6}pre{background:#1f2022}}
`.trim();

/** A complete, self-contained page. It is kept in the repository beside the text. */
export function standaloneHtml(title: string, fragment: string, note: string): string {
	return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${DOCUMENT_CSS}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${fragment}
<footer>${escapeHtml(note)}</footer>
</body>
</html>
`;
}
