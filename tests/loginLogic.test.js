'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const LoginLogic = require('../frontend/public/js/loginLogic');

const {
    LOGIN_GREETINGS,
    MIN_PASSWORD_LENGTH,
    getGreetingPeriod,
    pickLoginGreeting,
    getLoginTitle,
    getSubmitLabel,
    shouldShowPasswordConfirm,
    validateLoginForm,
    resolveRedirectTarget,
    getNoticeVariantForError,
    getFallbackLoginError,
    mapLoginResponseToNotice,
    getNoticeA11y,
} = LoginLogic;

describe('loginLogic', () => {
    describe('getGreetingPeriod', () => {
        const cases = [
            [0, 'night'],
            [4, 'night'],
            [5, 'earlyMorning'],
            [6, 'earlyMorning'],
            [7, 'morning'],
            [11, 'morning'],
            [12, 'afternoon'],
            [16, 'afternoon'],
            [17, 'evening'],
            [20, 'evening'],
            [21, 'night'],
            [23, 'night'],
        ];

        for (const [hour, expected] of cases) {
            it(`maps hour ${hour} to ${expected}`, () => {
                assert.equal(getGreetingPeriod(hour), expected);
            });
        }
    });

    describe('pickLoginGreeting', () => {
        it('returns a greeting from the matching period pool', () => {
            const greeting = pickLoginGreeting(14, () => 0);
            assert.ok(LOGIN_GREETINGS.afternoon.includes(greeting));
        });

        it('uses randomFn to select among options', () => {
            const lastIndex = LOGIN_GREETINGS.morning.length - 1;
            const greeting = pickLoginGreeting(9, () => 0.999);
            assert.equal(greeting, LOGIN_GREETINGS.morning[lastIndex]);
        });
    });

    describe('getLoginTitle', () => {
        it('returns registration title when account setup is required', () => {
            assert.equal(getLoginTitle(true, 10), 'Create your account');
        });

        it('returns a time-based greeting for sign-in mode', () => {
            const title = getLoginTitle(false, 10, () => 0);
            assert.equal(title, LOGIN_GREETINGS.morning[0]);
        });
    });

    describe('registration UI helpers', () => {
        it('shows confirm password only during registration', () => {
            assert.equal(shouldShowPasswordConfirm(true), true);
            assert.equal(shouldShowPasswordConfirm(false), false);
        });

        it('returns the correct submit label', () => {
            assert.equal(getSubmitLabel(true), 'Create account');
            assert.equal(getSubmitLabel(false), 'Sign In');
        });
    });

    describe('validateLoginForm', () => {
        it('rejects empty username or password', () => {
            assert.deepEqual(
                validateLoginForm({ username: '  ', password: '', needsRegistration: false }),
                { ok: false, message: 'Enter a username and password.' }
            );
        });

        it('accepts valid sign-in credentials', () => {
            assert.deepEqual(
                validateLoginForm({
                    username: ' alice ',
                    password: 'secret',
                    passwordConfirm: '',
                    needsRegistration: false,
                    rememberMe: true,
                }),
                { ok: true, body: { username: 'alice', password: 'secret', rememberMe: true } }
            );
        });

        it('includes rememberMe false when the switch is off', () => {
            assert.deepEqual(
                validateLoginForm({
                    username: 'alice',
                    password: 'secret',
                    passwordConfirm: '',
                    needsRegistration: false,
                    rememberMe: false,
                }),
                { ok: true, body: { username: 'alice', password: 'secret', rememberMe: false } }
            );
        });

        it('rejects mismatched passwords during registration', () => {
            assert.deepEqual(
                validateLoginForm({
                    username: 'alice',
                    password: 'password1',
                    passwordConfirm: 'password2',
                    needsRegistration: true,
                }),
                { ok: false, message: 'Passwords do not match.' }
            );
        });

        it(`rejects passwords shorter than ${MIN_PASSWORD_LENGTH} characters during registration`, () => {
            assert.deepEqual(
                validateLoginForm({
                    username: 'alice',
                    password: 'short',
                    passwordConfirm: 'short',
                    needsRegistration: true,
                }),
                { ok: false, message: 'Password must be at least 8 characters.' }
            );
        });

        it('accepts valid registration payload', () => {
            assert.deepEqual(
                validateLoginForm({
                    username: 'alice',
                    password: 'long-enough',
                    passwordConfirm: 'long-enough',
                    needsRegistration: true,
                    rememberMe: false,
                }),
                {
                    ok: true,
                    body: {
                        username: 'alice',
                        password: 'long-enough',
                        passwordConfirm: 'long-enough',
                        rememberMe: false,
                    },
                }
            );
        });
    });

    describe('resolveRedirectTarget', () => {
        it('defaults to dashboard when redirect is missing', () => {
            assert.equal(resolveRedirectTarget(null), '/dashboard');
            assert.equal(resolveRedirectTarget(undefined), '/dashboard');
        });

        it('allows same-origin relative paths', () => {
            assert.equal(resolveRedirectTarget('/editor'), '/editor');
            assert.equal(resolveRedirectTarget('/dashboard?tab=1'), '/dashboard?tab=1');
        });

        it('blocks protocol-relative and external redirects', () => {
            assert.equal(resolveRedirectTarget('//evil.example'), '/dashboard');
            assert.equal(resolveRedirectTarget('https://evil.example'), '/dashboard');
            assert.equal(resolveRedirectTarget('dashboard'), '/dashboard');
        });
    });

    describe('login error mapping', () => {
        it('maps rate limiting to a friendly message', () => {
            assert.deepEqual(getNoticeVariantForError(429), {
                message: 'Too many login attempts. Wait a few minutes and try again.',
                variant: 'error',
            });
        });

        it('maps known API validation errors', () => {
            assert.deepEqual(getNoticeVariantForError(400, 'password_mismatch'), {
                message: 'Passwords do not match.',
                variant: 'error',
            });
            assert.deepEqual(getNoticeVariantForError(400, 'password_too_short'), {
                message: 'Password must be at least 8 characters.',
                variant: 'error',
            });
        });

        it('returns null for unrecognized errors', () => {
            assert.equal(getNoticeVariantForError(401, 'nope'), null);
        });

        it('falls back based on registration mode', () => {
            assert.match(getFallbackLoginError(true), /create account/i);
            assert.match(getFallbackLoginError(false), /invalid username or password/i);
        });

        it('maps full login responses', () => {
            assert.equal(mapLoginResponseToNotice(200, null, false), null);
            assert.deepEqual(mapLoginResponseToNotice(429, null, false), {
                message: 'Too many login attempts. Wait a few minutes and try again.',
                variant: 'error',
            });
            assert.deepEqual(mapLoginResponseToNotice(401, null, false), {
                message: 'Invalid username or password.',
                variant: 'error',
            });
        });
    });

    describe('getNoticeA11y', () => {
        it('uses polite status semantics for info notices', () => {
            assert.deepEqual(getNoticeA11y('info'), { role: 'status', ariaLive: 'polite' });
        });

        it('uses assertive alert semantics for errors', () => {
            assert.deepEqual(getNoticeA11y('error'), { role: 'alert', ariaLive: 'assertive' });
        });
    });
});
