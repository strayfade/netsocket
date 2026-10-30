'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const settingsModalSource = fs.readFileSync(
    path.join(__dirname, '../frontend/public/js/settingsModal.js'),
    'utf8'
);

const STORED = [
    'Google:ada@example.com:JBSWY3DPEHPK3PXP',
    'Google:grace@example.com:J5XFGJIDSQOBMU34PAWOO4E3',
    'Microsoft:Marshall University:N7DV2C2ZHNKSPFQ5',
    'Bank:Joint:Checking:MFRGGZDF',
    'not-an-account',
    '',
].join(',');

function jsonResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return body;
        },
    };
}

function waitFor(fn, timeoutMs = 2000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const tick = () => {
            let value;
            try {
                value = fn();
            } catch (err) {
                reject(err);
                return;
            }
            if (value) {
                resolve(value);
                return;
            }
            if (Date.now() - start > timeoutMs) {
                reject(new Error('timed out waiting for settings UI'));
                return;
            }
            setTimeout(tick, 10);
        };
        tick();
    });
}

function mount(stored, onSave) {
    const html = `<!DOCTYPE html><html><body>
        <a href="#" id="open-settings">Settings</a>
        <div id="settings-modal" style="display:none">
            <div id="settings-backdrop"></div>
            <button type="button" id="close-settings">Close</button>
            <div id="settings-tabs-container"></div>
            <div id="settings-panels-scroll"></div>
        </div>
    </body></html>`;
    const dom = new JSDOM(html, {
        url: 'http://127.0.0.1:4675/dashboard',
        pretendToBeVisual: true,
        runScripts: 'dangerously',
    });
    const { window } = dom;
    window.fetch = async (url, options = {}) => {
        const method = options.method || 'GET';
        if (url === '/v1/preferences' && method === 'GET') {
            return jsonResponse(200, {
                preferences: [{
                    category: 'Authenticator',
                    id: 'authentication.otp_accounts',
                    displayName: 'OTP account secrets',
                    type: 'text',
                    value: stored,
                }],
            });
        }
        if (url === '/v1/preferences' && method === 'POST') {
            const body = JSON.parse(options.body);
            if (onSave) onSave(body);
            return jsonResponse(200, { ok: true });
        }
        if (url === '/v1/devices' || url === '/v1/smarthome/devices') {
            return jsonResponse(200, { devices: [] });
        }
        if (url === '/v1/providers') return jsonResponse(200, { providers: [] });
        if (String(url).indexOf('/v1/aria-settings') === 0) return jsonResponse(200, {});
        return jsonResponse(404, {});
    };
    const script = window.document.createElement('script');
    script.textContent = settingsModalSource;
    window.document.body.appendChild(script);
    if (window.document.getElementById('settings-modal').getAttribute('data-settings-shared-bound') !== 'true') {
        window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    }
    return dom;
}

async function openAuthenticator(dom) {
    dom.window.document.getElementById('open-settings').click();
    await waitFor(() => dom.window.document.querySelector('.otp-accounts-field'));
    const tabs = Array.from(dom.window.document.querySelectorAll('.settings-tab'));
    const authTab = tabs.find((tab) => tab.textContent.includes('Authenticator'));
    assert.ok(authTab, 'Authenticator settings tab exists');
    authTab.click();
    const panel = dom.window.document.querySelector('.otp-accounts-field').closest('.settings-panel');
    assert.equal(panel.style.display, '');
    return dom.window.document;
}

function cardFields(card) {
    const inputs = card.querySelectorAll('input');
    return {
        issuer: inputs[0].value,
        account: inputs[1].value,
        secret: inputs[2].value,
        secretType: inputs[2].type,
    };
}

describe('authenticator settings accounts', () => {
    it('parses the stored string into accounts and hides secrets', async () => {
        const dom = mount(STORED);
        const document = await openAuthenticator(dom);
        const cards = document.querySelectorAll('.otp-account-card');
        assert.equal(cards.length, 4);
        assert.equal(document.querySelector('.otp-accounts-count').textContent, '4 accounts');
        assert.match(document.querySelector('.otp-accounts-invalid').textContent, /1 stored entry/);

        assert.deepEqual(cardFields(cards[0]), {
            issuer: 'Google',
            account: 'ada@example.com',
            secret: 'JBSWY3DPEHPK3PXP',
            secretType: 'password',
        });
        assert.deepEqual(cardFields(cards[2]), {
            issuer: 'Microsoft',
            account: 'Marshall University',
            secret: 'N7DV2C2ZHNKSPFQ5',
            secretType: 'password',
        });
        assert.deepEqual(cardFields(cards[3]), {
            issuer: 'Bank',
            account: 'Joint:Checking',
            secret: 'MFRGGZDF',
            secretType: 'password',
        });
        assert.equal(cards[0].querySelector('.otp-account-issuer').textContent, 'Google');
        assert.equal(cards[0].querySelector('.otp-account-name').textContent, 'ada@example.com');
        assert.equal(document.querySelector('input[type="text"].otp-raw, textarea'), null);
        cards.forEach((card) => {
            assert.equal(card.querySelector('.otp-account-row').getAttribute('aria-expanded'), 'false');
            assert.equal(card.querySelector('.otp-account-body').hidden, true);
        });
    });

    it('shows and hides a secret without changing the value', async () => {
        const dom = mount(STORED);
        const document = await openAuthenticator(dom);
        const card = document.querySelector('.otp-account-card');
        const row = card.querySelector('.otp-account-row');
        const secret = card.querySelector('input[aria-label="Secret"]');
        const toggle = card.querySelector('button[aria-label="Show secret"]');

        row.click();
        assert.equal(card.querySelector('.otp-account-body').hidden, false);
        assert.equal(row.getAttribute('aria-expanded'), 'true');

        toggle.click();
        assert.equal(secret.type, 'text');
        assert.equal(secret.value, 'JBSWY3DPEHPK3PXP');
        assert.equal(toggle.getAttribute('aria-label'), 'Hide secret');
        assert.equal(toggle.getAttribute('aria-pressed'), 'true');

        toggle.click();
        assert.equal(secret.type, 'password');
        assert.equal(secret.value, 'JBSWY3DPEHPK3PXP');
        assert.equal(toggle.getAttribute('aria-label'), 'Show secret');

        toggle.click();
        row.click();
        assert.equal(card.querySelector('.otp-account-body').hidden, true);
        assert.equal(secret.type, 'password');
        assert.equal(toggle.getAttribute('aria-label'), 'Show secret');
    });

    it('saves edits back to the comma-separated Issuer:Account:Secret format', async () => {
        let saved = null;
        const dom = mount(STORED, (body) => { saved = body; });
        const document = await openAuthenticator(dom);
        const cards = document.querySelectorAll('.otp-account-card');
        cards[0].querySelector('input[aria-label="Account"]').value = 'ada.updated@example.com';
        cards[0].querySelector('input[aria-label="Account"]').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        cards[3].querySelector('button[aria-label="Remove account"]').click();
        document.querySelector('button.otp-accounts-secondary').click();

        const added = document.querySelectorAll('.otp-account-card');
        const newCard = added[added.length - 1];
        newCard.querySelector('input[aria-label="Issuer"]').value = 'GitHub';
        newCard.querySelector('input[aria-label="Account"]').value = 'octocat';
        newCard.querySelector('input[aria-label="Secret"]').value = 'GEZD GNBS';
        assert.equal(newCard.querySelector('.otp-account-body').hidden, false);
        assert.equal(newCard.querySelector('.otp-account-issuer').textContent, 'New account');
        newCard.querySelector('input[aria-label="Issuer"]').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        assert.equal(newCard.querySelector('.otp-account-issuer').textContent, 'GitHub');
        assert.equal(newCard.querySelector('.otp-account-name').textContent, 'octocat');

        document.querySelector('.otp-accounts-actions button:last-child').click();
        await waitFor(() => document.querySelector('.otp-accounts-status').textContent === 'Saved.');
        assert.equal(saved.name, 'authentication.otp_accounts');
        assert.equal(
            saved.value,
            'Google:ada.updated@example.com:JBSWY3DPEHPK3PXP,Google:grace@example.com:J5XFGJIDSQOBMU34PAWOO4E3,Microsoft:Marshall University:N7DV2C2ZHNKSPFQ5,GitHub:octocat:GEZDGNBS,not-an-account'
        );
        assert.equal(document.querySelector('.otp-accounts-status').textContent, 'Saved.');
    });

    it('does not save an account that is missing a secret', async () => {
        let saved = null;
        const dom = mount('GitHub:octocat:JBSWY3DPEHPK3PXP', (body) => { saved = body; });
        const document = await openAuthenticator(dom);
        const secret = document.querySelector('input[aria-label="Secret"]');
        secret.value = '';
        document.querySelector('.otp-accounts-actions button:last-child').click();
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.equal(saved, null);
        assert.match(document.querySelector('.otp-accounts-status').textContent, /needs an issuer/);
        const card = document.querySelector('.otp-account-card-error');
        assert.ok(card);
        assert.equal(card.querySelector('.otp-account-body').hidden, false);
    });
});
