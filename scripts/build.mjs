// Builds the site for the address in ORIGIN, and records that address beside the build.
// SvelteKit fixes the address at build time, and forms are refused if it does not match.
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
const origin = process.env.ORIGIN || 'http://localhost:3000';
const out = process.env.BUILD_DIR || 'build';
const result = spawnSync('npx', ['vite', 'build'], {
	stdio: 'inherit',
	env: { ...process.env, ORIGIN: origin, BUILD_DIR: out }
});
if (result.status !== 0) process.exit(result.status ?? 1);
writeFileSync(`${out}/.origin`, `${origin}\n`);
