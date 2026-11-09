import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
	process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'os-crypto-'));
	process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
	vi.resetModules();
});

describe('key encryption', () => {
	it('round-trips, and does not contain the plaintext', async () => {
		const { seal, unseal } = await import('../../src/lib/server/crypto.ts');
		const sealed = seal('sk-or-v1-secret', 5);
		expect(Buffer.from(sealed.ciphertext).toString('utf8')).not.toContain('secret');
		expect(unseal(sealed, 5)).toBe('sk-or-v1-secret');
	});
	it('refuses a row moved to another account', async () => {
		const { seal, unseal } = await import('../../src/lib/server/crypto.ts');
		const sealed = seal('sk-or-v1-secret', 5);
		expect(() => unseal(sealed, 6)).toThrow();
	});
	it('refuses tampered data', async () => {
		const { seal, unseal } = await import('../../src/lib/server/crypto.ts');
		const sealed = seal('sk-or-v1-secret', 5);
		const bad = Buffer.from(sealed.ciphertext);
		bad[0] ^= 1;
		expect(() => unseal({ ...sealed, ciphertext: bad }, 5)).toThrow();
	});
	it('uses a fresh nonce each time', async () => {
		const { seal } = await import('../../src/lib/server/crypto.ts');
		expect(Buffer.from(seal('a', 1).iv).equals(Buffer.from(seal('a', 1).iv))).toBe(false);
	});
	it('removes keys from text', async () => {
		const { scrub } = await import('../../src/lib/server/crypto.ts');
		expect(scrub('failed with sk-or-v1-abc_DEF-123 here')).toBe('failed with sk-or-[removed] here');
	});
});
