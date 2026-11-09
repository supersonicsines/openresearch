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

const DOCUMENT_CSS = `
:root{color-scheme:light dark}
body{margin:0 auto;padding:3rem 1.25rem 5rem;max-width:40rem;font:1.125rem/1.65 "Source Serif 4",Georgia,serif;color:#17181a;background:#fff}
h1,h2,h3{font-weight:500;line-height:1.25;letter-spacing:-.005em;margin:2.2em 0 .6em}
h1{font-size:1.9rem;margin-top:0}h2{font-size:1.45rem}h3{font-size:1.2rem}
a{color:#1c3f6e;text-underline-offset:.15em}
blockquote{margin:1.4em 0;padding-left:1.1em;border-left:2px solid #d9d9d6;color:#4d4f53}
table{border-collapse:collapse;width:100%;font-size:.95em}th,td{padding:.45em .7em;border-bottom:1px solid #e6e6e3;text-align:left}
code,pre{font-family:ui-monospace,Menlo,monospace;font-size:.88em}pre{overflow:auto;padding:1em;background:#f5f5f3;border-radius:6px}
footer{margin-top:3.5em;padding-top:1em;border-top:1px solid #e6e6e3;font-size:.875rem;color:#5f6165}
@media (prefers-color-scheme:dark){body{color:#ececea;background:#161719}a{color:#a9c1e6}blockquote{color:#b3b4b6;border-color:#35363a}th,td,footer{border-color:#2c2d30}footer{color:#a3a4a6}pre{background:#1f2022}}
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
