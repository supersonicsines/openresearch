import { describe, expect, it } from 'vitest';
import { addressKey, hit, routedPath, ruleFor } from '../../src/lib/server/limits.ts';

// The checks are pure functions of the address and the settings, so they can be tested directly.
const { isPublicOrigin, startupReport } = await import('../../src/lib/server/env.ts');

const GOOD = {
	X_CLIENT_ID: 'id',
	X_CLIENT_SECRET: 'secret',
	ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
	ADMIN_HANDLES: 'someone',
	CONTACT_EMAIL: 'a@example.org',
	ADDRESS_HEADER: 'X-Forwarded-For'
};

describe('startup checks', () => {
	it('recognises local addresses', () => {
		expect(isPublicOrigin('http://localhost:3000')).toBe(false);
		expect(isPublicOrigin('http://127.0.0.1:3000')).toBe(false);
		expect(isPublicOrigin('https://example.org')).toBe(true);
		expect(isPublicOrigin('http://localhost.evil.org')).toBe(true);
	});

	it('asks nothing of a local address', () => {
		expect(startupReport('http://localhost:3000', {})).toEqual({ problems: [], warnings: [] });
	});

	it('accepts a complete public configuration', () => {
		expect(startupReport('https://example.org', GOOD)).toEqual({ problems: [], warnings: [] });
	});

	it.each([
		['plain http', 'http://example.org', {}],
		['sign-in without X', 'https://example.org', { ALLOW_DEV_SIGNIN: '1' }],
		['demonstration mode', 'https://example.org', { DEMO_MODE: '1' }],
		['keys sent elsewhere', 'https://example.org', { OPENROUTER_BASE_URL: 'https://evil.example/api/v1' }],
		['a stand-in for X', 'https://example.org', { X_API_BASE: 'http://localhost:1' }],
		['no X secret', 'https://example.org', { X_CLIENT_SECRET: '' }],
		['no encryption key', 'https://example.org', { ENCRYPTION_KEY: '' }],
		['a short encryption key', 'https://example.org', { ENCRYPTION_KEY: 'c2hvcnQ=' }],
		['no address header', 'https://example.org', { ADDRESS_HEADER: '' }]
	])('refuses to start with %s', (_, origin, change) => {
		expect(startupReport(origin, { ...GOOD, ...change }).problems).toHaveLength(1);
	});

	it('warns about what can be lived with', () => {
		const { problems, warnings } = startupReport('https://example.org', { ...GOOD, ADMIN_HANDLES: '', CONTACT_EMAIL: '' });
		expect(problems).toEqual([]);
		expect(warnings).toHaveLength(2);
	});
});

describe('limits', () => {
	it('cannot be avoided by encoding the path', () => {
		expect(ruleFor('GET', routedPath('/%63ard/site.png'))?.name).toBe('card');
		expect(ruleFor('GET', routedPath('/p/x/archive.zi%70'))?.name).toBe('zip');
		expect(ruleFor('GET', routedPath('/%61uth/x'))?.name).toBe('auth');
		expect(routedPath('/bad%E0%A4%A')).toBe('/bad%E0%A4%A');
	});
	it('counts an IPv6 /64 as one visitor', () => {
		expect(addressKey('2001:db8:1:2::1')).toBe(addressKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd'));
		expect(addressKey('2001:db8:1:2::1')).not.toBe(addressKey('2001:db8:1:3::1'));
		expect(addressKey('2001:DB8:1:2::1')).toBe('2001:0db8:0001:0002::/64');
		expect(addressKey('2001:db8::1')).toBe('2001:0db8:0000:0000::/64');
		expect(addressKey('::ffff:10.0.0.1')).toBe('10.0.0.1');
		expect(addressKey('10.0.0.1')).toBe('10.0.0.1');
	});
	it('allows up to the limit, then says how long to wait', () => {
		const key = `test:${Math.random()}`;
		const now = 1_000_000;
		expect(hit(key, 2, 60_000, now)).toBe(0);
		expect(hit(key, 2, 60_000, now)).toBe(0);
		expect(hit(key, 2, 60_000, now + 1_000)).toBe(59);
		expect(hit(key, 2, 60_000, now + 60_000)).toBe(0);
	});
	it('can be switched off', () => {
		const key = `test:${Math.random()}`;
		for (let i = 0; i < 5; i++) expect(hit(key, 0, 60_000)).toBe(0);
	});
});
