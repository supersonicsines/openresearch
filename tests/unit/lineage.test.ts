import { describe, expect, it } from 'vitest';
import {
	advance,
	oneLine,
	readQuestionList,
	REVIEW_QUESTION,
	stateAt,
	tally,
	treeAt,
	type OpenQuestion,
	type Step,
	type TreeNode
} from '../../src/lib/lineage.ts';
import { renderFindings, sections } from '../../src/lib/server/render.ts';

const step = (over: Partial<Step>): Step => ({
	seq: 1,
	question: 'The prompt?',
	at: 100,
	lastSeq: 0,
	prompt: 'The prompt?',
	next: [],
	...over
});

describe('what one run does to the record of questions', () => {
	it('the first run researches the prompt, and its edit raises the first questions', () => {
		const out = advance([], step({ next: ['A?', 'B?', 'A?'] }));
		expect(out.answered).toEqual({
			row: { text: 'The prompt?', origin: 'prompt', parent_seq: 0, proposal_id: null, raised_at: 100 }
		});
		// A question listed twice is raised once.
		expect(out.raised).toEqual(['A?', 'B?']);
		expect(out.closed).toEqual([]);
	});
	it('a listed question is researched, kept ones stay, dropped ones are set aside, and new ones are raised', () => {
		const open: OpenQuestion[] = [
			{ id: 1, text: 'A?' },
			{ id: 2, text: 'B?' },
			{ id: 3, text: 'C?' }
		];
		const out = advance(open, step({ seq: 2, question: 'A?', lastSeq: 1, next: ['B?', 'D?'] }));
		expect(out.answered).toEqual({ id: 1 });
		expect(out.closed).toEqual([3]);
		expect(out.raised).toEqual(['D?']);
	});
	it('a question that is listed again after being researched is raised afresh', () => {
		const out = advance([{ id: 1, text: 'A?' }], step({ seq: 2, question: 'A?', lastSeq: 1, next: ['A?'] }));
		expect(out.answered).toEqual({ id: 1 });
		expect(out.raised).toEqual(['A?']);
	});
	it('a review stands at the top, beside the first run, since it looks at the prompt afresh', () => {
		const out = advance([], step({ seq: 5, question: REVIEW_QUESTION, lastSeq: 4, next: [] }));
		expect(out.answered).toMatchObject({ row: { origin: 'review', parent_seq: 0 } });
	});
	it('a question chosen in a round is recorded with whoever proposed it, and takes nothing off the list', () => {
		const open: OpenQuestion[] = [{ id: 1, text: 'A?' }];
		const out = advance(
			open,
			step({
				seq: 3,
				question: 'A?',
				lastSeq: 2,
				directed: { kind: 'question', proposalId: 9, raisedAt: 50, parentSeq: 1 },
				next: ['A?']
			})
		);
		expect(out.answered).toEqual({
			row: { text: 'A?', origin: 'proposal', parent_seq: 1, proposal_id: 9, raised_at: 50 }
		});
		expect(out.closed).toEqual([]);
		expect(out.raised).toEqual([]);
	});
	it('the standing audit is recorded as such', () => {
		const out = advance([], step({ seq: 2, question: 'Audit?', directed: { kind: 'audit', proposalId: 4, raisedAt: 1, parentSeq: 1 } }));
		expect(out.answered).toMatchObject({ row: { origin: 'audit' } });
	});
	it('where the list is not known, nothing is set aside or raised', () => {
		const out = advance([{ id: 1, text: 'A?' }], step({ seq: 2, question: 'Other?', lastSeq: 1, next: null }));
		expect(out).toMatchObject({ closed: [], raised: [] });
		expect(out.answered).toMatchObject({ row: { origin: 'editor', parent_seq: 1 } });
	});
	it('reads the list a run left in its repository', () => {
		expect(readQuestionList('# Open questions\n\n- First   question?\n- Second?\n')).toEqual(['First question?', 'Second?']);
		expect(readQuestionList('# Open questions\n\nNone are listed at present.\n')).toEqual([]);
	});
	it('keeps a question on one line', () => {
		expect(oneLine(' a\nb\u0000c  d ')).toBe('a b c d');
	});
});

const run = (seq: number, costMicro = 10_000) => ({
	seq,
	at: seq * 1000,
	modelName: 'M',
	costMicro,
	handle: 'h',
	avatar: null,
	headline: `Found ${seq}`,
	sources: 1
});
const node = (over: Partial<TreeNode>): TreeNode => ({
	id: 'q1',
	text: 'Q?',
	origin: 'editor',
	parent: 0,
	raisedAt: 0,
	proposer: null,
	run: null,
	closedSeq: null,
	proposalId: null,
	pledged: 0,
	backers: 0,
	...over
});

describe('the tree as it stood after any run', () => {
	const nodes: TreeNode[] = [
		node({ id: 'q1', origin: 'prompt', run: run(1) }),
		node({ id: 'q2', parent: 1, run: run(2, 20_000) }),
		node({ id: 'q3', parent: 1, run: run(4, 40_000) }),
		node({ id: 'q4', parent: 1, closedSeq: 3 }),
		node({ id: 'q5', parent: 2 }),
		node({ id: 'p7', origin: 'proposal', parent: 2, proposalId: 7, pledged: 5_000_000, backers: 2, proposer: 'x' })
	];

	it('a question is not shown before it was raised, and is open until it is researched', () => {
		expect(stateAt(nodes[1], 0)).toBeNull();
		expect(stateAt(nodes[1], 1)).toBe('open');
		expect(stateAt(nodes[1], 2)).toBe('researched');
		// One researched at run 4 was still open after run 3.
		expect(stateAt(nodes[2], 3)).toBe('open');
		expect(stateAt(nodes[3], 2)).toBe('open');
		expect(stateAt(nodes[3], 3)).toBe('aside');
		expect(stateAt(nodes[5], 1)).toBeNull();
		expect(stateAt(nodes[5], 4)).toBe('proposed');
	});
	it('questions hang from the run that raised them, and a branch counts what is beneath it', () => {
		const tree = treeAt(nodes, 4);
		expect(tree).toHaveLength(1);
		const root = tree[0];
		expect(root.node.id).toBe('q1');
		expect(root.children.map((c) => c.node.id)).toEqual(['q2', 'q3', 'q4']);
		// Beneath a run: what is in a round, then what is open.
		expect(root.children[0].children.map((c) => [c.node.id, c.state])).toEqual([
			['p7', 'proposed'],
			['q5', 'open']
		]);
		expect(root.runs).toBe(3);
		expect(root.costMicro).toBe(70_000);
		expect(root.below).toBe(5);
		// A question whose parent cannot be found is shown at the top, and is never lost.
		expect(treeAt([...nodes, node({ id: 'q9', parent: 3 })], 4).map((b) => b.node.id)).toEqual(['q1', 'q9']);
	});
	it('the past is drawn from the same record', () => {
		const tree = treeAt(nodes, 1);
		expect(tree[0].children.map((c) => [c.node.id, c.state])).toEqual([
			['q2', 'open'],
			['q3', 'open'],
			['q4', 'open']
		]);
		expect(tally(tree)).toEqual({ raised: 4, researched: 1, open: 3, aside: 0, proposed: 0, depth: 2 });
		// Before the first run, the prompt had been asked and nothing else.
		expect(treeAt(nodes, 0).map((b) => [b.node.id, b.state])).toEqual([['q1', 'open']]);
	});
	it('counts each state at the present', () => {
		expect(tally(treeAt(nodes, 4))).toEqual({ raised: 6, researched: 3, open: 1, aside: 1, proposed: 1, depth: 3 });
	});
});

describe('findings in sections', () => {
	const md = 'The answer stands.\n\n## What is established\n\nA claim, with [a source](https://a.example/).\n\n### A detail\n\nMore.\n\n## Proposals that have not been tested\n\nAn idea.\n';

	it('divides the document at its second-level headings, after the answer', () => {
		const out = sections(md);
		expect(out.lead).toContain('The answer stands.');
		expect(out.sections.map((s) => s.title)).toEqual(['What is established', 'Proposals that have not been tested']);
		expect(out.sections[0].sources).toBe(1);
		expect(out.sections[0].html).toContain('<h3>A detail</h3>');
	});
	it('renders each section so that it opens and closes, closed to begin with', () => {
		const html = renderFindings(md);
		expect(html.match(/<details class="section"/g)).toHaveLength(2);
		expect(html).not.toContain('<details class="section" open');
		expect(html).toContain('<summary><h2>What is established</h2><span class="count">1 source</span></summary>');
		expect(html.indexOf('The answer stands.')).toBeLessThan(html.indexOf('<details'));
	});
	it('divides at whichever level of heading the document uses, as older documents did not use the second', () => {
		const older = sections('The answer.\n\n### One\n\nA.\n\n#### A detail\n\nB.\n\n### Two\n\nC.\n');
		expect(older.sections.map((s) => s.title)).toEqual(['One', 'Two']);
		expect(older.sections[0].html).toContain('<h4>A detail</h4>');
		// A single title above the sections is left above them.
		const titled = sections('# The title\n\nThe answer.\n\n## One\n\nA.\n\n## Two\n\nB.\n');
		expect(titled.sections.map((s) => s.title)).toEqual(['One', 'Two']);
		expect(titled.lead).toContain('<h1>The title</h1>');
		// One heading alone still makes a section.
		expect(sections('Lead.\n\n## Only\n\nA.\n').sections).toHaveLength(1);
	});
	it('leaves a document without sections as it is', () => {
		expect(renderFindings('Only a paragraph.')).toBe('<p>Only a paragraph.</p>\n');
		expect(renderFindings('')).toBe('');
	});
	it('gives the model no say in the markup around a section', () => {
		const html = renderFindings('## <script>alert(1)</script> "x"\n\n<details open ontoggle=alert(1)>y</details>\n\n## </summary></details><img src=x onerror=alert(1)>\n\nz');
		// What the model wrote in a heading is shown as text. No element or attribute of its own survives.
		expect(html).not.toMatch(/<script|<img|<[a-z][^>]*\son\w+=/i);
		expect(html.match(/<details/g)).toHaveLength(2);
		expect(html.match(/<\/details>/g)).toHaveLength(2);
	});
	it('a heading inside a list or a quotation does not divide the document', () => {
		const out = sections('## One\n\n- item\n  ## inside\n\n> ## quoted\n');
		expect(out.sections).toHaveLength(1);
	});
	it('is quick on hostile input', () => {
		const started = Date.now();
		renderFindings(`${'## x\n\n'.repeat(4000)}${'\n'.repeat(20_000)}${'](http://'.repeat(5000)}`);
		expect(Date.now() - started).toBeLessThan(3000);
	});
});
