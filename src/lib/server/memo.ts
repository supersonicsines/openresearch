// Public pages read the same figures for everyone, so a burst of visitors need not repeat the same
// queries. A cached result is valid only until anything is next written, so nothing is ever stale by
// more than the short time limit, which exists for figures that change with the clock.
import { get } from './db.ts';

type Entry = { generation: number; at: number; value: unknown };

const cache = new Map<string, Entry>();
const MAX_ENTRIES = 500;
const TTL = 30_000;

export function memo<T>(key: string, read: () => T): T {
	const generation = get<{ n: number }>('SELECT total_changes() AS n')?.n ?? 0;
	const now = Date.now();
	const found = cache.get(key);
	if (found && found.generation === generation && now - found.at < TTL) return found.value as T;
	const value = read();
	if (cache.size >= MAX_ENTRIES) cache.clear();
	cache.set(key, { generation, at: now, value });
	return value;
}
