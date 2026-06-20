'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { initLoginPage } = require('../frontend/public/js/loginPage');

const fixtureHtml = fs.readFileSync(
    path.join(__dirname, 'helpers', 'loginFixture.html'),
    'utf8'
);

function createFetchMock(handlers) {
    return async (url, options = {}) => {
        const key = `${options.method || 'GET'} ${url}`;
        const handler = handlers[key];
        if (!handler) {
            throw new Error(`Unhandled fetch: ${key}`);
        }
        return handler(options);
    };
}

function jsonResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return body;
        },
    };
}

describe('loginPage DOM integration', () => {
    let dom;
    let page;

    beforeEach(() => {
        dom = new JSDOM(fixtureHtml, { url: 'http://127.0.0.1:4675/login' });
        const { document } = dom.window;
        globalThis.LoginLogic = require('../frontend/public/js/loginLogic');
    });

    it('loads auth state and switches to registration mode', async () => {
        const fetchMock = createFetchMock({
            'GET /v1/auth-state': async () => jsonResponse(200, { needsRegistration: true }),
        });
        page = initLoginPage(dom.window.document, { fetch: fetchMock });
        await page.applyAuthState();

        assert.equal(page.getNeedsRegistration(), true);
        assert.equal(dom.window.document.getElementById('loginTitle').textContent, 'Create your account');
        assert.equal(
            dom.window.document.getElementById('submitBtn').querySelector('.button-submit-label').textContent,
            'Create account'
        );
        assert.equal(
            dom.window.document.getElementById('passwordConfirmRow').classList.contains('hidden'),
            false
        );
    });

    it('shows validation errors without calling login', async () => {
        const fetchMock = createFetchMock({
            'GET /v1/auth-state': async () => jsonResponse(200, { needsRegistration: false }),
        });
        page = initLoginPage(dom.window.document, { fetch: fetchMock });
        await page.applyAuthState();

        let loginCalled = false;
        const guardedFetch = async (url, options) => {
            if (url === '/login') loginCalled = true;
            return fetchMock(url, options);
        };
        page = initLoginPage(dom.window.document, { fetch: guardedFetch });
        await page.applyAuthState();

        dom.window.document.getElementById('username').value = '';
        dom.window.document.getElementById('password').value = '';
        await page.login(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

        const notice = dom.window.document.getElementById('loginNotice');
        assert.equal(notice.hasAttribute('hidden'), false);
        assert.equal(dom.window.document.getElementById('loginNoticeText').textContent,
            'Enter a username and password.');
        assert.equal(loginCalled, false);
    });

    it('sends rememberMe with login requests', async () => {
        let loginBody = null;
        const fetchMock = createFetchMock({
            'GET /v1/auth-state': async () => jsonResponse(200, { needsRegistration: false }),
            'POST /login': async (options) => {
                loginBody = JSON.parse(options.body);
                return jsonResponse(200, {});
            },
        });
        page = initLoginPage(dom.window.document, { fetch: fetchMock });
        await page.applyAuthState();

        dom.window.document.getElementById('username').value = 'alice';
        dom.window.document.getElementById('password').value = 'secret-pass';
        dom.window.document.getElementById('rememberMe').checked = true;
        await page.login(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

        assert.equal(loginBody.rememberMe, true);
    });

    it('redirects to a safe path after successful login', async () => {
        let redirectedTo = null;
        const fetchMock = createFetchMock({
            'GET /v1/auth-state': async () => jsonResponse(200, { needsRegistration: false }),
            'POST /login': async () => jsonResponse(200, {}),
        });
        page = initLoginPage(dom.window.document, {
            fetch: fetchMock,
            locationSearch: '?redirect=/editor',
            onLoginSuccess(target) {
                redirectedTo = target;
            },
        });
        await page.applyAuthState();

        dom.window.document.getElementById('username').value = 'alice';
        dom.window.document.getElementById('password').value = 'secret-pass';
        await page.login(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

        assert.equal(redirectedTo, '/editor');
    });

    it('blocks unsafe redirect targets after successful login', async () => {
        let redirectedTo = null;
        const fetchMock = createFetchMock({
            'GET /v1/auth-state': async () => jsonResponse(200, { needsRegistration: false }),
            'POST /login': async () => jsonResponse(200, {}),
        });
        page = initLoginPage(dom.window.document, {
            fetch: fetchMock,
            locationSearch: '?redirect=//evil.example',
            onLoginSuccess(target) {
                redirectedTo = target;
            },
        });
        await page.applyAuthState();

        dom.window.document.getElementById('username').value = 'alice';
        dom.window.document.getElementById('password').value = 'secret-pass';
        await page.login(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

        assert.equal(redirectedTo, '/dashboard');
    });

    it('surfaces API password validation errors during registration', async () => {
        const fetchMock = createFetchMock({
            'GET /v1/auth-state': async () => jsonResponse(200, { needsRegistration: true }),
            'POST /login': async () => jsonResponse(400, { error: 'password_too_short' }),
        });
        page = initLoginPage(dom.window.document, { fetch: fetchMock });
        await page.applyAuthState();

        dom.window.document.getElementById('username').value = 'alice';
        dom.window.document.getElementById('password').value = 'long-enough';
        dom.window.document.getElementById('passwordConfirm').value = 'long-enough';
        await page.login(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

        assert.equal(
            dom.window.document.getElementById('loginNoticeText').textContent,
            'Password must be at least 8 characters.'
        );
        assert.equal(dom.window.document.getElementById('loginNotice').getAttribute('role'), 'alert');
    });

    it('dismisses notices and restores accessibility defaults', async () => {
        const fetchMock = createFetchMock({
            'GET /v1/auth-state': async () => jsonResponse(200, { needsRegistration: false }),
        });
        page = initLoginPage(dom.window.document, { fetch: fetchMock });
        await page.applyAuthState();

        page.showLoginNotice('Something went wrong', 'error');
        page.hideLoginNotice();

        const notice = dom.window.document.getElementById('loginNotice');
        assert.equal(notice.hasAttribute('hidden'), true);
        assert.equal(dom.window.document.getElementById('loginNoticeText').textContent, '');
        assert.equal(notice.classList.contains('login-notice--error'), false);
    });
});
