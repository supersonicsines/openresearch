import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ command, mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	// The adapter assumes https unless an origin is fixed at build time.
	const origin = process.env.ORIGIN || env.ORIGIN || 'http://localhost:3000';

	return {
		plugins: [
			sveltekit({
				compilerOptions: { runes: true },
				adapter: adapter({ out: process.env.BUILD_DIR || 'build' }),
				paths: command === 'build' ? { origin } : undefined,
				// A tab left open learns of a new release within a minute, and takes it at its next navigation.
				version: { pollInterval: 60_000 },
				csp: {
					mode: 'auto',
					directives: {
						'default-src': ['self'],
						'script-src': ['self'],
						// Svelte transitions and the demo stage set inline styles.
						'style-src': ['self', 'unsafe-inline'],
						'img-src': ['self', 'data:', 'https://avatars.githubusercontent.com'],
						'font-src': ['self'],
						'connect-src': ['self'],
						'object-src': ['none'],
						'base-uri': ['self'],
						'form-action': ['self'],
						'frame-ancestors': ['none']
					}
				}
			})
		],
		define: { __BUILD_ORIGIN__: JSON.stringify(origin) },
		// JSX is used only by the demo in src/lib/stage.
		oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
		// Every asset stays a real file, so the font-src policy can remain 'self'.
		build: { assetsInlineLimit: 0 },
		test: {
			include: ['tests/unit/**/*.test.ts'],
			// macOS adds ._ files beside everything on a USB drive, and they would be read as tests.
			exclude: ['**/._*', '**/node_modules/**']
		}
	};
});
