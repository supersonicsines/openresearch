import { dev as isDev } from '$app/env';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');

const e = process.env;

export const config = {
	dataDir: resolve(e.DATA_DIR || 'data'),
	githubClientId: e.GITHUB_CLIENT_ID || '',
	githubClientSecret: e.GITHUB_CLIENT_SECRET || '',
	encryptionKey: e.ENCRYPTION_KEY || '',
	openRouterBase: (e.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
	/** Sign-in without GitHub, for local prototypes and tests only. Off unless it is asked for. */
	allowDevSignin: e.ALLOW_DEV_SIGNIN === '1',
	demoMode: e.DEMO_MODE === '1',
	maxActiveProjects: Number(e.MAX_ACTIVE_PROJECTS ?? 16),
	/** GitHub handles allowed into /admin. Compared without regard to case. */
	adminHandles: (e.ADMIN_HANDLES || '')
		.split(',')
		.map((handle) => handle.trim().replace(/^@/, '').toLowerCase())
		.filter(Boolean),
	/** Shown on the terms and privacy pages. */
	contactEmail: e.CONTACT_EMAIL || '',
	/** A flood limit per account. 0 removes it. */
	promptsPerHour: Number(e.MAX_PROMPTS_PER_HOUR ?? 20)
};

export const githubConfigured = () => Boolean(config.githubClientId);

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Prototype sign-in lets anyone claim any handle, so it needs two things: development mode with GitHub
 * unconfigured, or an explicit ALLOW_DEV_SIGNIN=1; and a request that really comes from this machine.
 * The address is taken from the connection, since the URL's host is fixed at build time.
 */
export function devSigninAllowed(clientAddress: () => string): boolean {
	if (!config.allowDevSignin && !(isDev && !githubConfigured())) return false;
	try {
		return LOOPBACK.has(clientAddress());
	} catch {
		return false;
	}
}

declare const __BUILD_ORIGIN__: string;

/** The address fixed when the site was built. */
export const buildOrigin = typeof __BUILD_ORIGIN__ === 'string' ? __BUILD_ORIGIN__ : 'http://localhost:3000';

export function isPublicOrigin(origin: string): boolean {
	return !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/.test(origin);
}

function encryptionKeyProblem(value: string | undefined): string | null {
	if (!value) return 'ENCRYPTION_KEY is not set. `npm run setup` creates one.';
	if (Buffer.from(value, 'base64').length !== 32) return 'ENCRYPTION_KEY must be 32 bytes, base64 encoded.';
	return null;
}

export type StartupReport = { problems: string[]; warnings: string[] };

/**
 * On Railway, anything written outside an attached volume is lost at the next deployment, including
 * the database, the repositories and the record of what has been spent.
 */
function railwayProblem(env: Record<string, string | undefined>): string | null {
	if (!env.RAILWAY_ENVIRONMENT) return null;
	const mount = env.RAILWAY_VOLUME_MOUNT_PATH;
	if (!mount) return 'No volume is attached to this Railway service, so everything saved would be lost at the next deployment. A volume must be mounted at /data.';
	const dataDir = resolve(env.DATA_DIR || 'data');
	const path = relative(resolve(mount), dataDir);
	const inside = path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
	if (inside) return null;
	return `DATA_DIR is ${dataDir}, which is outside the Railway volume at ${mount}, so everything saved would be lost at the next deployment.`;
}

/**
 * What must be true before real keys and real accounts are handled. Any problem stops the server,
 * because each of these would either expose visitors or leave the site unusable.
 */
export function startupReport(origin: string, env: Record<string, string | undefined>): StartupReport {
	const problems: string[] = [];
	const warnings: string[] = [];
	const railway = railwayProblem(env);
	if (railway) problems.push(railway);
	if (!isPublicOrigin(origin)) return { problems, warnings };

	if (!origin.startsWith('https://')) problems.push(`ORIGIN must use https, but the site was built for ${origin}.`);
	if (env.ALLOW_DEV_SIGNIN === '1') problems.push('ALLOW_DEV_SIGNIN must not be set: it allows anyone to claim any handle.');
	if (env.DEMO_MODE === '1') problems.push('DEMO_MODE must not be set on a public address.');
	if (env.OPENROUTER_BASE_URL && !env.OPENROUTER_BASE_URL.startsWith('https://openrouter.ai/')) {
		problems.push('OPENROUTER_BASE_URL points away from OpenRouter, so donors\' keys would be sent elsewhere.');
	}
	if (env.GITHUB_WEB_BASE || env.GITHUB_API_BASE) problems.push('GITHUB_WEB_BASE and GITHUB_API_BASE are for tests only and must not be set.');
	if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) problems.push('GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set, or nobody can sign in.');
	const keyProblem = encryptionKeyProblem(env.ENCRYPTION_KEY);
	if (keyProblem) problems.push(keyProblem);
	// Behind a proxy with no header, either no limits apply, or every visitor shares one allowance.
	if (!env.ADDRESS_HEADER) problems.push('ADDRESS_HEADER must be set to the header in which the proxy sends the address of each visitor, usually X-Forwarded-For.');

	if (!env.ADMIN_HANDLES) warnings.push('ADMIN_HANDLES is not set, so /admin cannot be used and nothing can be taken down from the site.');
	if (!env.CONTACT_EMAIL) warnings.push('CONTACT_EMAIL is not set, so the terms and privacy pages give no address for complaints.');
	return { problems, warnings };
}

/** Prints what is wrong and stops the process if the site is not safe to run. */
export function checkStartup() {
	const { problems, warnings } = startupReport(buildOrigin, e);
	const local: string[] = [];
	try {
		execFileSync('git', ['--version'], { stdio: 'ignore' });
	} catch {
		local.push('git could not be run, and a repository is created for every prompt.');
	}
	// The card fonts are read relative to the working directory.
	if (!existsSync(join(process.cwd(), 'assets', 'card-fonts'))) {
		local.push(`assets/card-fonts was not found. The server must be started from the project folder, not ${process.cwd()}.`);
	}
	for (const warning of warnings) console.warn(`Warning: ${warning}`);
	const fatal = [...problems, ...local];
	if (fatal.length === 0) return;
	console.error('The server was not started:');
	for (const problem of fatal) console.error(`  - ${problem}`);
	process.exit(1);
}
