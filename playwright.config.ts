import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
	testDir: 'tests/e2e',
	// macOS adds ._ files beside everything on a USB drive, and they would be read as tests.
	testIgnore: '**/._*',
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	expect: { timeout: 15_000 },
	reporter: [['list']],
	use: {
		baseURL: `http://localhost:${PORT}`,
		// The installed copy of Chrome is used. `npx playwright install chromium` is the alternative,
		// in which case PW_CHANNEL should be set to an empty value.
		channel: process.env.PW_CHANNEL ?? 'chrome'
	},
	webServer: {
		command: `rm -rf data-e2e && ADMIN_HANDLES=launchadmin,a-very-long-handle-of-thirty-nine-chars DEMO_DATA_DIR=data-e2e BUILD_DIR=build-e2e PORT=${PORT} MOCK_PORT=8798 MOCK_DELAY=6 node scripts/demo.mjs --no-seed --no-open --build`,
		url: `http://localhost:${PORT}`,
		reuseExistingServer: false,
		timeout: 180_000,
		stdout: 'pipe'
	}
});
