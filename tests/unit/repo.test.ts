import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it, vi } from 'vitest';

let repo: typeof import('../../src/lib/server/repo.ts');
const author = { name: '@tester', email: 'x@opensearch.invalid' };

beforeAll(async () => {
	process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'os-repo-'));
	vi.resetModules();
	repo = await import('../../src/lib/server/repo.ts');
	await repo.createRepo('sample-abc123', { 'PROMPT.md': 'A prompt\n' }, 'First', author);
});

describe('repositories', () => {
	it('commits with the given author and records the history', async () => {
		const sha = await repo.commitFiles('sample-abc123', { 'runs/0001.md': 'Text\n' }, 'Run 1\n\nCost-usd: 0.1\n', author);
		expect(sha).toMatch(/^[0-9a-f]{40}$/);
		const log = await repo.log('sample-abc123');
		expect(log[0].subject).toBe('Run 1');
		expect(log[0].author).toBe('@tester');
		expect(log).toHaveLength(2);
	});
	it('reads only tracked files', async () => {
		expect(await repo.readTracked('sample-abc123', 'PROMPT.md')).toBe('A prompt\n');
		expect(await repo.readTracked('sample-abc123', '.git/config')).toBeNull();
		expect(await repo.readTracked('sample-abc123', '../../../etc/passwd')).toBeNull();
		writeFileSync(join(repo.repoDir('sample-abc123'), 'untracked.txt'), 'x');
		expect(await repo.readTracked('sample-abc123', 'untracked.txt')).toBeNull();
	});
	it('rejects unsafe repository names', () => {
		for (const bad of ['../x', 'a/b', '.git', '', 'A', 'a b', '-x']) {
			expect(() => repo.repoDir(bad)).toThrow();
		}
		expect(repo.repoExists('../x')).toBe(false);
	});
	it('serves only what a read-only clone needs', () => {
		for (const good of ['HEAD', 'info/refs', 'objects/info/packs', `objects/ab/${'c'.repeat(38)}`]) {
			expect(repo.clonePath('sample-abc123', good)).not.toBeNull();
		}
		for (const bad of ['config', 'hooks/pre-commit', 'index', 'logs/HEAD', '../../secret', 'refs/heads/main', 'objects/../config', `objects/ab/${'z'.repeat(38)}`, 'description']) {
			expect(repo.clonePath('sample-abc123', bad)).toBeNull();
		}
	});
	it('is unaffected by global git settings', () => {
		const dir = repo.repoDir('sample-abc123');
		const value = execFileSync('git', ['config', '--local', 'commit.gpgsign'], { cwd: dir }).toString().trim();
		expect(value).toBe('false');
	});
});
