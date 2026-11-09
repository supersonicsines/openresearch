import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { devNull } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { config } from './env.ts';

const exec = promisify(execFile);
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

/** Repositories are isolated from whatever git settings exist on the machine. */
const GIT_ENV = {
	PATH: process.env.PATH ?? '',
	GIT_CONFIG_GLOBAL: devNull,
	GIT_CONFIG_NOSYSTEM: '1',
	GIT_TERMINAL_PROMPT: '0',
	// A repository that has been deleted must never fall through to one in a folder above it.
	GIT_CEILING_DIRECTORIES: join(config.dataDir, 'repos'),
	LC_ALL: 'C'
};

export function repoDir(slug: string): string {
	if (!SLUG.test(slug)) throw new Error('Invalid repository name.');
	return join(config.dataDir, 'repos', slug);
}

export function repoExists(slug: string): boolean {
	return SLUG.test(slug) && existsSync(join(repoDir(slug), '.git'));
}

async function git(slug: string, args: string[], extraEnv: Record<string, string> = {}) {
	const { stdout } = await exec('git', args, {
		cwd: repoDir(slug),
		env: { ...GIT_ENV, ...extraEnv },
		maxBuffer: 32 * 1024 * 1024
	});
	return stdout;
}

export type Author = { name: string; email: string };

function writeFiles(slug: string, files: Record<string, string>) {
	const dir = repoDir(slug);
	for (const [path, contents] of Object.entries(files)) {
		const target = join(dir, path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, contents);
	}
}

async function commitAll(slug: string, message: string, author: Author): Promise<string> {
	if (!repoExists(slug)) throw new Error('The repository no longer exists.');
	await git(slug, ['add', '--all']);
	const dir = repoDir(slug);
	await new Promise<void>((resolve, reject) => {
		const child = spawn('git', ['commit', '--quiet', '--allow-empty', '-F', '-'], {
			cwd: dir,
			env: {
				...GIT_ENV,
				GIT_AUTHOR_NAME: author.name,
				GIT_AUTHOR_EMAIL: author.email,
				GIT_COMMITTER_NAME: 'OpenResearch',
				GIT_COMMITTER_EMAIL: 'runs@openresearch.invalid'
			},
			stdio: ['pipe', 'ignore', 'pipe']
		});
		let stderr = '';
		child.stderr.on('data', (d) => (stderr += d));
		child.on('error', reject);
		child.on('close', (code) =>
			code === 0 ? resolve() : reject(new Error(`git commit failed: ${stderr.trim()}`))
		);
		child.stdin.end(message);
	});
	// Keeps the repository readable over plain HTTP for `git clone`.
	await git(slug, ['update-server-info']);
	return (await git(slug, ['rev-parse', 'HEAD'])).trim();
}

export async function createRepo(
	slug: string,
	files: Record<string, string>,
	message: string,
	author: Author
): Promise<string> {
	const dir = repoDir(slug);
	mkdirSync(dir, { recursive: true });
	// An empty template leaves out the sample hooks, which come to about 60 KB per repository.
	await exec('git', ['init', '--quiet', '--template=', '--initial-branch=main', dir], { env: GIT_ENV });
	await git(slug, ['config', 'core.hooksPath', devNull]);
	await git(slug, ['config', 'commit.gpgsign', 'false']);
	writeFiles(slug, files);
	return commitAll(slug, message, author);
}

export async function commitFiles(
	slug: string,
	files: Record<string, string>,
	message: string,
	author: Author
): Promise<string> {
	writeFiles(slug, files);
	return commitAll(slug, message, author);
}

export async function listFiles(slug: string): Promise<string[]> {
	const out = await git(slug, ['ls-files', '-z']);
	return out.split('\0').filter(Boolean);
}

export type CommitInfo = { sha: string; subject: string; author: string; date: number };

export async function log(slug: string, limit = 50): Promise<CommitInfo[]> {
	const out = await git(slug, ['log', `-${limit}`, '--format=%H%x00%s%x00%an%x00%ct']);
	return out
		.split('\n')
		.filter(Boolean)
		.map((line) => {
			const [sha, subject, author, date] = line.split('\0');
			return { sha, subject, author, date: Number(date) * 1000 };
		});
}

/** Reads a committed file. Only names listed by git itself are accepted. */
export async function readTracked(slug: string, path: string): Promise<string | null> {
	const files = await listFiles(slug);
	if (!files.includes(path)) return null;
	return git(slug, ['show', `HEAD:${path}`]);
}

export async function archiveZip(slug: string): Promise<Buffer> {
	const { stdout } = await exec('git', ['archive', '--format=zip', `--prefix=${slug}/`, 'HEAD'], {
		cwd: repoDir(slug),
		env: GIT_ENV,
		encoding: 'buffer',
		maxBuffer: 256 * 1024 * 1024
	});
	return stdout;
}

/** The only paths under .git that are served, which is what a read-only clone needs. */
const CLONE_PATH =
	/^(HEAD|info\/refs|objects\/info\/(packs|alternates|http-alternates)|objects\/[0-9a-f]{2}\/[0-9a-f]{38,62}|objects\/pack\/pack-[0-9a-f]{40,64}\.(pack|idx|rev))$/;

export function clonePath(slug: string, path: string): string | null {
	if (!repoExists(slug) || !CLONE_PATH.test(path)) return null;
	return join(repoDir(slug), '.git', path);
}
