export const MAX_WORDS = 250;
/** Guards against a single enormous "word". Well beyond any 250-word prompt in normal prose. */
export const MAX_CHARS = 6000;

export function countWords(text: string): number {
	const trimmed = text.trim();
	return trimmed ? trimmed.split(/\s+/).length : 0;
}

export type PromptCheck = { ok: true; prompt: string } | { ok: false; message: string };

export function checkPrompt(raw: unknown): PromptCheck {
	const prompt = typeof raw === 'string' ? raw.replace(/\r\n/g, '\n').trim() : '';
	if (!prompt) return { ok: false, message: 'A prompt must be entered.' };
	// Git cannot store these, and they serve no purpose in a prompt.
	if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(prompt)) {
		return { ok: false, message: 'The prompt contains control characters, which must be removed.' };
	}
	const words = countWords(prompt);
	if (words > MAX_WORDS) {
		return {
			ok: false,
			message: `The prompt is ${words} words long. It must be reduced to ${MAX_WORDS} words or fewer.`
		};
	}
	if (prompt.length > MAX_CHARS) {
		return {
			ok: false,
			message: `The prompt is ${prompt.length.toLocaleString('en-GB')} characters long. It must be reduced to ${MAX_CHARS.toLocaleString('en-GB')} characters or fewer.`
		};
	}
	return { ok: true, prompt };
}

/** A short title taken from the prompt itself: the first sentence, or the first words of it. */
export function titleFromPrompt(prompt: string): string {
	const flat = prompt.replace(/\s+/g, ' ').trim();
	const sentence = flat.match(/^.{12,}?[.?!](?=\s|$)/)?.[0] ?? flat;
	if (sentence.length <= 200) return sentence;
	const cut = sentence.slice(0, 197);
	return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 120)).trimEnd()}…`;
}

export function slugFromPrompt(prompt: string, suffix: string): string {
	const base = prompt
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 7)
		.join('-')
		.slice(0, 56)
		.replace(/^-+|-+$/g, '');
	return base ? `${base}-${suffix}` : suffix;
}

/**
 * A slug that is not yet in use. A prompt with no Latin letters has only the random part, six hex
 * digits, so two projects could otherwise be given the same one, and share a repository.
 */
export function freeSlug(prompt: string, taken: (slug: string) => boolean, suffix: () => string): string | null {
	for (let i = 0; i < 20; i++) {
		const slug = slugFromPrompt(prompt, suffix());
		if (!taken(slug)) return slug;
	}
	return null;
}
