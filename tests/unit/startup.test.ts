import { describe, expect, it } from 'vitest';
import { addressKey, clientKey, hit, limitFor, routedPath, ruleFor, UNREAD_ADDRESS } from '../../src/lib/server/limits.ts';

// The checks are pure functions of the address and the settings, so they can be tested directly.
const { isPublicOrigin, startupReport } = await import('../../src/lib/server/env.ts');

const GOOD = {
	GITHUB_CLIENT_ID: 'id',
	GITHUB_CLIENT_SECRET: 'secret',
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
		['sign-in without GitHub', 'https://example.org', { ALLOW_DEV_SIGNIN: '1' }],
		['demonstration mode', 'https://example.org', { DEMO_MODE: '1' }],
		['keys sent elsewhere', 'https://example.org', { OPENROUTER_BASE_URL: 'https://evil.example/api/v1' }],
		['a stand-in for GitHub', 'https://example.org', { GITHUB_API_BASE: 'http://localhost:1' }],
		['no GitHub secret', 'https://example.org', { GITHUB_CLIENT_SECRET: '' }],
		['no encryption key', 'https://example.org', { ENCRYPTION_KEY: '' }],
		['a short encryption key', 'https://example.org', { ENCRYPTION_KEY: 'c2hvcnQ=' }],
		['no address header', 'https://example.org', { ADDRESS_HEADER: '' }],
		['a round of a few seconds', 'https://example.org', { ROUND_MINUTES: '0.25' }]
	])('refuses to start with %s', (_, origin, change) => {
		expect(startupReport(origin, { ...GOOD, ...change }).problems).toHaveLength(1);
	});

	describe('on Railway', () => {
		const RAILWAY = { ...GOOD, RAILWAY_ENVIRONMENT: 'production', DATA_DIR: '/data' };
		it('starts with the data folder on the volume', () => {
			expect(startupReport('https://example.org', { ...RAILWAY, RAILWAY_VOLUME_MOUNT_PATH: '/data' }).problems).toEqual([]);
			expect(startupReport('https://example.org', { ...RAILWAY, RAILWAY_VOLUME_MOUNT_PATH: '/data', DATA_DIR: '/data/site' }).problems).toEqual([]);
		});
		it('refuses to start with no volume', () => {
			const { problems } = startupReport('https://example.org', RAILWAY);
			expect(problems).toHaveLength(1);
			expect(problems[0]).toContain('No volume is attached');
		});
		it('refuses to start with the data folder outside the volume', () => {
			for (const DATA_DIR of ['/app/data', '/', '/database', '/data/../app']) {
				const { problems } = startupReport('https://example.org', { ...RAILWAY, RAILWAY_VOLUME_MOUNT_PATH: '/data', DATA_DIR });
				expect(problems, DATA_DIR).toHaveLength(1);
				expect(problems[0]).toContain('outside the Railway volume');
			}
		});
		it('is checked whatever address the site was built for', () => {
			expect(startupReport('http://localhost:3000', RAILWAY).problems).toHaveLength(1);
		});
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
		expect(ruleFor('GET', routedPath('/%61uth/github'))?.name).toBe('auth');
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
	it('still apply when the address cannot be read', () => {
		const missing = () => {
			throw new Error('Address header was specified with ADDRESS_HEADER=x-forwarded-for but is absent from request');
		};
		expect(clientKey(missing, true)).toBe(UNREAD_ADDRESS);
		expect(clientKey(missing, false)).toBe(UNREAD_ADDRESS);
		expect(clientKey(() => '', true)).toBe(UNREAD_ADDRESS);
		expect(limitFor('GET', '/', UNREAD_ADDRESS)?.name).toBe('read');
		expect(limitFor('POST', '/submit', UNREAD_ADDRESS)?.name).toBe('write');
		expect(limitFor('GET', '/card/site.png', UNREAD_ADDRESS)?.name).toBe('card');
	});
	it('leave the health check alone when it arrives without an address', () => {
		expect(limitFor('GET', '/healthz', UNREAD_ADDRESS)).toBeNull();
		expect(limitFor('GET', '/healthz', '10.0.0.1')?.name).toBe('read');
	});
	it('are not applied to a local visitor when no proxy is configured', () => {
		expect(clientKey(() => '127.0.0.1', false)).toBeNull();
		expect(clientKey(() => '127.0.0.1', true)).toBe('127.0.0.1');
		expect(clientKey(() => '203.0.113.9', false)).toBe('203.0.113.9');
		expect(limitFor('GET', '/', null)).toBeNull();
		expect(limitFor('GET', '/_app/immutable/x.js', '10.0.0.1')).toBeNull();
	});
	it('can be switched off', () => {
		const key = `test:${Math.random()}`;
		for (let i = 0; i < 5; i++) expect(hit(key, 0, 60_000)).toBe(0);
	});
});
