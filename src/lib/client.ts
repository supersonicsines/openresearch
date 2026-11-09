/** Sends JSON to one of the site's own endpoints and returns the parsed reply. */
export async function postJson<T = Record<string, unknown>>(
	url: string,
	body: unknown = {},
	method = 'POST'
): Promise<{ ok: boolean; status: number; data: T & { message?: string } }> {
	const res = await fetch(url, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	let data = {} as T & { message?: string };
	try {
		data = await res.json();
	} catch {
		/* An empty body is acceptable. */
	}
	return { ok: res.ok, status: res.status, data };
}

export function connectHref(next: string): string {
	return `/auth/github?next=${encodeURIComponent(next)}`;
}
