'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const cookie = require('cookie');
const { setUsers } = require('../server/manager/saveUsers');
const sessionAuth = require('../server/utils/sessionAuth');

const {
    MIN_PASSWORD_LENGTH,
    REMEMBER_ME_IDLE_MS,
    safeRedirectPath,
    isProtectedPagePath,
    integrationSecretMatches,
    providedSecretMatches,
    getBearerTokenFromHeader,
    bearerTokenMatches,
    isLanAddress,
    isLanClient,
    getTokenFromCookieHeader,
    createToken,
    validateToken,
    hasUserSession,
    revokeToken,
    loginRateLimit,
    recordFailedLoginAttempt,
    securityHeaders,
    sessionCookieOpts,
    getSessionCookieOpts,
    getSessionIdleMs,
    parseRememberMe,
} = sessionAuth;

const originalArgv = [...process.argv];

function mockReqRes(overrides = {}) {
    const headers = {};
    const cookies = {};
    const req = {
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
        headers,
        cookies,
        originalUrl: '/dashboard',
        ...overrides,
    };
    const res = {
        statusCode: 200,
        headers: {},
        cookieCalls: [],
        ended: false,
        setHeader(name, value) {
            this.headers[name] = value;
        },
        cookie(name, value, opts) {
            this.cookieCalls.push({ name, value, opts });
        },
        sendStatus(code) {
            this.statusCode = code;
            this.ended = true;
        },
    };
    return { req, res };
}

describe('sessionAuth', () => {
    beforeEach(() => {
        setUsers([]);
        process.argv = originalArgv.filter((arg) => arg !== '--skip-auth');
    });

    afterEach(() => {
        process.argv = [...originalArgv];
    });

    describe('constants', () => {
        it('requires passwords of at least eight characters', () => {
            assert.equal(MIN_PASSWORD_LENGTH, 8);
        });
    });

    describe('safeRedirectPath', () => {
        it('allows safe relative paths', () => {
            assert.equal(safeRedirectPath('/dashboard'), '/dashboard');
            assert.equal(safeRedirectPath('/editor?x=1'), '/editor?x=1');
        });

        it('rejects open redirects', () => {
            assert.equal(safeRedirectPath('//evil.example'), '/dashboard');
            assert.equal(safeRedirectPath('https://evil.example'), '/dashboard');
            assert.equal(safeRedirectPath(null), '/dashboard');
        });
    });

    describe('isProtectedPagePath', () => {
        it('matches protected assets case-insensitively', () => {
            assert.equal(isProtectedPagePath('/dashboard'), true);
            assert.equal(isProtectedPagePath('/LiteGraph.js'), true);
            assert.equal(isProtectedPagePath('/css/editor.css?cache=1'), true);
        });

        it('does not treat public paths as protected', () => {
            assert.equal(isProtectedPagePath('/login'), false);
            assert.equal(isProtectedPagePath('/'), false);
        });
    });

    describe('integrationSecretMatches', () => {
        it('compares secrets in constant time semantics via tokensEqual', () => {
            const secret = 'integration-secret';
            assert.equal(integrationSecretMatches({ headers: { 'x-socket-auth': secret } }, secret), true);
            assert.equal(integrationSecretMatches({ headers: { 'x-socket-auth': 'wrong' } }, secret), false);
            assert.equal(integrationSecretMatches({ headers: {} }, secret), false);
            assert.equal(integrationSecretMatches({ headers: { 'x-socket-auth': secret } }, ''), false);
        });
    });

    describe('providedSecretMatches', () => {
        it('compares request body secrets in constant time semantics via tokensEqual', () => {
            const secret = 'command-palette-secret';
            assert.equal(providedSecretMatches(secret, secret), true);
            assert.equal(providedSecretMatches('wrong', secret), false);
            assert.equal(providedSecretMatches('', secret), false);
            assert.equal(providedSecretMatches(secret, ''), false);
            assert.equal(providedSecretMatches(null, secret), false);
        });
    });

    describe('bearerTokenMatches', () => {
        it('parses Authorization Bearer tokens from requests', () => {
            assert.equal(getBearerTokenFromHeader({ headers: { authorization: 'Bearer abc123' } }), 'abc123');
            assert.equal(getBearerTokenFromHeader({ headers: { Authorization: 'bearer token-value' } }), 'token-value');
            assert.equal(getBearerTokenFromHeader({ headers: { authorization: 'Bearer  trimmed  ' } }), 'trimmed');
            assert.equal(getBearerTokenFromHeader({ headers: {} }), null);
            assert.equal(getBearerTokenFromHeader({ headers: { authorization: 'Basic abc' } }), null);
            assert.equal(getBearerTokenFromHeader({ headers: { authorization: 'Bearer' } }), null);
        });

        it('compares bearer tokens in constant time semantics via tokensEqual', () => {
            const secret = 'mcp-api-token';
            assert.equal(bearerTokenMatches({ headers: { authorization: `Bearer ${secret}` } }, secret), true);
            assert.equal(bearerTokenMatches({ headers: { authorization: 'Bearer wrong' } }, secret), false);
            assert.equal(bearerTokenMatches({ headers: {} }, secret), false);
            assert.equal(bearerTokenMatches({ headers: { authorization: `Bearer ${secret}` } }, ''), false);
        });
    });

    describe('isLanClient', () => {
        it('accepts loopback and private IPv4 addresses', () => {
            assert.equal(isLanAddress('127.0.0.1'), true);
            assert.equal(isLanAddress('10.0.0.5'), true);
            assert.equal(isLanAddress('192.168.1.42'), true);
            assert.equal(isLanAddress('172.16.0.1'), true);
            assert.equal(isLanAddress('169.254.10.1'), true);
            assert.equal(isLanAddress('::ffff:192.168.1.42'), true);
            assert.equal(isLanClient({ socket: { remoteAddress: '127.0.0.1' } }), true);
            assert.equal(isLanClient({ socket: { remoteAddress: '::ffff:10.0.0.2' } }), true);
        });

        it('accepts local IPv6 addresses', () => {
            assert.equal(isLanAddress('::1'), true);
            assert.equal(isLanAddress('fe80::1'), true);
            assert.equal(isLanAddress('fd12:3456:789a:1::1'), true);
        });

        it('rejects public internet addresses', () => {
            assert.equal(isLanAddress('8.8.8.8'), false);
            assert.equal(isLanAddress('203.0.113.10'), false);
            assert.equal(isLanAddress('2001:4860:4860::8888'), false);
            assert.equal(isLanClient({ socket: { remoteAddress: '203.0.113.10' } }), false);
        });
    });

    describe('session lifecycle', () => {
        it('parses session cookies from websocket-style headers', () => {
            const token = 'abc123-_';
            const header = cookie.serialize('tk', token);
            assert.equal(getTokenFromCookieHeader(header), token);
            assert.equal(getTokenFromCookieHeader('other=1'), null);
        });

        it('creates and validates a session token', () => {
            const { res } = mockReqRes();
            const token = createToken({ rememberMe: true });
            assert.equal(typeof token, 'string');
            assert.doesNotMatch(token, /[+/=]/);
            assert.equal(validateToken(token), true);
            assert.equal(validateToken('invalid'), false);
            assert.equal(hasUserSession({ cookies: { tk: token } }, res), true);
            assert.equal(res.cookieCalls.length, 1);
            assert.equal(res.cookieCalls[0].name, 'tk');
            assert.deepEqual(res.cookieCalls[0].opts, getSessionCookieOpts(true));
        });

        it('uses a session cookie when remember me is disabled', () => {
            const { res } = mockReqRes();
            const token = createToken({ rememberMe: false });
            assert.equal(hasUserSession({ cookies: { tk: token } }, res), true);
            assert.deepEqual(res.cookieCalls[0].opts, sessionCookieOpts);
            assert.equal(res.cookieCalls[0].opts.maxAge, undefined);
        });

        it('keeps remember-me sessions valid across a simulated restart', () => {
            const token = createToken({ rememberMe: true });
            const users = require('../server/manager/saveUsers').getUsers();
            assert.equal(users[0].remember, true);
            assert.equal(getSessionIdleMs(users[0]), REMEMBER_ME_IDLE_MS);

            setUsers([]);
            setUsers([{ ts: Date.now(), tk: token, remember: true }]);
            assert.equal(validateToken(token), true);
        });

        it('parses remember-me request values', () => {
            assert.equal(parseRememberMe(true), true);
            assert.equal(parseRememberMe('true'), true);
            assert.equal(parseRememberMe('1'), true);
            assert.equal(parseRememberMe(false), false);
            assert.equal(parseRememberMe(undefined), false);
        });

        it('revokes tokens and rejects them afterwards', () => {
            const token = createToken({ rememberMe: false });
            assert.equal(validateToken(token), true);
            revokeToken(token);
            assert.equal(validateToken(token), false);
        });

        it('slides session expiration on activity', () => {
            const token = createToken({ rememberMe: true });
            const usersBefore = require('../server/manager/saveUsers').getUsers();
            const firstTs = usersBefore[0].ts;
            hasUserSession({ cookies: { tk: token } });
            const usersAfter = require('../server/manager/saveUsers').getUsers();
            assert.ok(usersAfter[0].ts >= firstTs);
        });
    });

    describe('loginRateLimit', () => {
        it('allows requests under the attempt threshold', () => {
            const { req, res } = mockReqRes();
            let called = false;
            loginRateLimit(req, res, () => { called = true; });
            assert.equal(called, true);
            assert.equal(res.ended, false);
        });

        it('blocks requests after repeated failures from the same IP', () => {
            const { req, res } = mockReqRes();
            for (let i = 0; i < 10; i += 1) {
                recordFailedLoginAttempt(req);
            }
            let called = false;
            loginRateLimit(req, res, () => { called = true; });
            assert.equal(called, false);
            assert.equal(res.statusCode, 429);
        });

        it('skips rate limiting when auth is disabled', () => {
            process.argv.push('--skip-auth');
            const { req, res } = mockReqRes();
            for (let i = 0; i < 20; i += 1) {
                recordFailedLoginAttempt(req);
            }
            let called = false;
            loginRateLimit(req, res, () => { called = true; });
            assert.equal(called, true);
        });
    });

    describe('securityHeaders', () => {
        it('sets baseline security headers', () => {
            const { req, res } = mockReqRes();
            let called = false;
            securityHeaders(req, res, () => { called = true; });
            assert.equal(called, true);
            assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
            assert.equal(res.headers['X-Frame-Options'], 'SAMEORIGIN');
            assert.equal(res.headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
            assert.match(res.headers['Permissions-Policy'], /camera=\(\)/);
        });
    });
});
