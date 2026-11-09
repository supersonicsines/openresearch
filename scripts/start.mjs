// Runs the production build with the values held in .env.
import { existsSync, readFileSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
if (!existsSync('build/index.js')) {
	console.error('No build was found. `npm run build` should be run first.');
	process.exit(1);
}
process.env.HOST ||= '127.0.0.1';
const origin = process.env.ORIGIN || 'http://localhost:3000';
const built = existsSync('build/.origin') ? readFileSync('build/.origin', 'utf8').trim() : '';
if (built !== origin) {
	console.error(`The build was made for ${built || 'an unknown address'}, but ORIGIN is ${origin}. \`npm run build\` should be run again.`);
	process.exit(1);
}
await import(new URL('../build/index.js', import.meta.url).href);
