// The rules of a round that are shared by the page and the server.

export const MAX_QUESTION_WORDS = 60;
/** Guards against a single enormous "word". */
export const MAX_QUESTION_CHARS = 600;

/** The standing question on every project. It is listed whether or not anyone has backed it. */
export const AUDIT_QUESTION =
	'Which claims in the findings are not supported by the sources cited for them, or are contradicted by other sources?';

export type QuestionCheck = { ok: true; question: string } | { ok: false; message: string };

/** A question is kept on one line, since it is shown in lists and written into the record of a run. */
export function checkQuestion(raw: unknown): QuestionCheck {
	if (typeof raw !== 'string') return { ok: false, message: 'A question must be entered.' };
	// Nothing of this length could be a question, so it is not read any further.
	if (raw.length > MAX_QUESTION_CHARS * 20) {
		return { ok: false, message: `The question must be reduced to ${MAX_QUESTION_WORDS} words or fewer.` };
	}
	// Git cannot store these, and they serve no purpose in a question.
	if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(raw)) {
		return { ok: false, message: 'The question contains control characters, which must be removed.' };
	}
	const question = raw.split(/\s+/).filter(Boolean).join(' ');
	if (!question) return { ok: false, message: 'A question must be entered.' };
	const words = question.split(' ').length;
	if (words > MAX_QUESTION_WORDS) {
		return {
			ok: false,
			message: `The question is ${words} words long. It must be reduced to ${MAX_QUESTION_WORDS} words or fewer.`
		};
	}
	if (question.length > MAX_QUESTION_CHARS) {
		return {
			ok: false,
			message: `The question is ${question.length.toLocaleString('en-GB')} characters long. It must be reduced to ${MAX_QUESTION_CHARS} characters or fewer.`
		};
	}
	return { ok: true, question };
}

export type Ranked = { id: number; pledged: number };

/** The order of a round: the most pledged first, and the earlier question where two are level. */
export function byPledged<T extends Ranked>(rows: T[]): T[] {
	return [...rows].sort((a, b) => b.pledged - a.pledged || a.id - b.id);
}

/** "5 h 12 min", "12 min", "45 s": the time left before a round closes. */
export function timeLeft(ms: number): string {
	const seconds = Math.max(0, Math.ceil(ms / 1000));
	if (seconds < 60) return `${seconds} s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours < 48) return rest ? `${hours} h ${rest} min` : `${hours} h`;
	return `${Math.floor(hours / 24)} d`;
}

/** A pledge made this close to the end keeps the round open for as long again, so that it can be answered. */
export function extensionMs(roundMs: number): number {
	return Math.min(10 * 60_000, Math.floor(roundMs / 10));
}
