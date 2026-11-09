// Creates .env with a fresh encryption key on first use. An existing .env is left alone.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const quiet = process.argv.includes('--quiet');
if (existsSync('.env')) {
	if (!quiet) console.log('.env already exists and has been left unchanged.');
} else {
	const template = readFileSync('.env.example', 'utf8');
	const contents = template.replace(
		/^ENCRYPTION_KEY=.*$/m,
		`ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`
	);
	writeFileSync('.env', contents, { mode: 0o600 });
	console.log('.env has been created with a new encryption key.');
}
