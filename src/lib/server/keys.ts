import { get, run } from './db.ts';
import { seal, unseal } from './crypto.ts';
import type { KeyInfo } from './openrouter.ts';

export type StoredKey = {
	user_id: number;
	preview: string;
	limit_micro: number | null;
	remaining_micro: number | null;
	limit_reset: string | null;
	checked_at: number;
};

export type PublicKey = Omit<StoredKey, 'user_id'>;

export const looksLikeKey = (value: string) => /^sk-or-[A-Za-z0-9_-]{8,256}$/.test(value);

export function preview(key: string): string {
	return `sk-or-…${key.slice(-4)}`;
}

export function saveKey(userId: number, key: string, info: KeyInfo) {
	const sealed = seal(key, userId);
	const now = Date.now();
	run(
		`INSERT INTO api_keys (user_id, ciphertext, iv, tag, preview, limit_micro, remaining_micro, limit_reset, checked_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (user_id) DO UPDATE SET
			ciphertext = excluded.ciphertext, iv = excluded.iv, tag = excluded.tag, preview = excluded.preview,
			limit_micro = excluded.limit_micro, remaining_micro = excluded.remaining_micro,
			limit_reset = excluded.limit_reset, checked_at = excluded.checked_at`,
		userId,
		sealed.ciphertext,
		sealed.iv,
		sealed.tag,
		preview(key),
		info.limitMicro,
		info.remainingMicro,
		info.limitReset,
		now,
		now
	);
}

export function updateKeyInfo(userId: number, info: KeyInfo) {
	run(
		`UPDATE api_keys SET limit_micro = ?, remaining_micro = ?, limit_reset = ?, checked_at = ? WHERE user_id = ?`,
		info.limitMicro,
		info.remainingMicro,
		info.limitReset,
		Date.now(),
		userId
	);
}

export function getPublicKey(userId: number): PublicKey | null {
	return (
		get<PublicKey>(
			`SELECT preview, limit_micro, remaining_micro, limit_reset, checked_at FROM api_keys WHERE user_id = ?`,
			userId
		) ?? null
	);
}

export function readKey(userId: number): string | null {
	const row = get<{ ciphertext: Uint8Array; iv: Uint8Array; tag: Uint8Array }>(
		`SELECT ciphertext, iv, tag FROM api_keys WHERE user_id = ?`,
		userId
	);
	return row ? unseal(row, userId) : null;
}

export function deleteKey(userId: number) {
	run('DELETE FROM api_keys WHERE user_id = ?', userId);
}
