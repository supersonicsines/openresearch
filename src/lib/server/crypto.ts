import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './env.ts';

let cached: Buffer | undefined;

function masterKey(): Buffer {
	if (cached) return cached;
	if (config.encryptionKey) {
		const key = Buffer.from(config.encryptionKey, 'base64');
		if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes, base64 encoded.');
		return (cached = key);
	}
	// With no key configured, one is kept beside the data so that keys are never stored in the clear.
	mkdirSync(config.dataDir, { recursive: true });
	const file = join(config.dataDir, 'encryption.key');
	if (!existsSync(file)) {
		writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600 });
		chmodSync(file, 0o600);
	}
	return (cached = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64'));
}

export type Sealed = { ciphertext: Uint8Array; iv: Uint8Array; tag: Uint8Array };

/** The owner's id is bound to the ciphertext, so a row cannot be moved to another account. */
export function seal(plaintext: string, userId: number): Sealed {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
	cipher.setAAD(Buffer.from(String(userId)));
	const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	return { ciphertext, iv, tag: cipher.getAuthTag() };
}

export function unseal(sealed: Sealed, userId: number): string {
	const decipher = createDecipheriv('aes-256-gcm', masterKey(), sealed.iv);
	decipher.setAAD(Buffer.from(String(userId)));
	decipher.setAuthTag(Buffer.from(sealed.tag));
	return Buffer.concat([
		decipher.update(Buffer.from(sealed.ciphertext)),
		decipher.final()
	]).toString('utf8');
}

export function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
	return randomBytes(bytes).toString('base64url');
}

/** Removes anything resembling an OpenRouter key from text that may be logged or shown. */
export function scrub(text: string): string {
	return text.replace(/sk-or-[A-Za-z0-9_-]+/g, 'sk-or-[removed]');
}
