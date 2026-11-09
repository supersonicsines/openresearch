// `npm run backup`: a consistent copy of the database and repositories, in one folder.
// It is safe to run while the server is running. The encryption key is deliberately not included.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

if (existsSync('.env')) process.loadEnvFile('.env');
const dataDir = resolve(process.env.DATA_DIR || 'data');
const source = join(dataDir, 'opensearch.sqlite');
if (!existsSync(source)) {
	console.error(`No database was found at ${source}.`);
	process.exit(1);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = resolve(process.argv[2] || `backups/${stamp}`);
mkdirSync(target, { recursive: true });

const db = new DatabaseSync(source);
db.exec(`VACUUM INTO '${join(target, 'opensearch.sqlite').replaceAll("'", "''")}'`);
db.close();
if (existsSync(join(dataDir, 'repos'))) cpSync(join(dataDir, 'repos'), join(target, 'repos'), { recursive: true });
console.log(`A backup has been written to ${target}.`);
console.log('ENCRYPTION_KEY is not included, and it should be kept separately. Stored keys cannot be read without it.');
