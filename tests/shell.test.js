'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ShellLogic = require('../frontend/public/js/shell');

describe('shell tab logic', () => {
    it('maps paths to the active tab', () => {
        assert.equal(ShellLogic.getActiveTab('/dashboard'), 'dashboard');
        assert.equal(ShellLogic.getActiveTab('/automate'), 'automate');
        assert.equal(ShellLogic.getActiveTab('/panels'), 'panels');
        assert.equal(ShellLogic.getActiveTab('/panel/kitchen'), 'panels');
        assert.equal(ShellLogic.getActiveTab('/AUTOMATE?foo=1'), 'automate');
    });

    it('falls back to dashboard for unknown or missing paths', () => {
        assert.equal(ShellLogic.getActiveTab('/nope'), 'dashboard');
        assert.equal(ShellLogic.getActiveTab(null), 'dashboard');
        assert.equal(ShellLogic.getTabHref('bogus'), '/dashboard');
    });

    it('rejects open redirects in login redirect targets', () => {
        assert.equal(ShellLogic.buildLoginRedirect('//evil.com'), '/login?redirect=%2Fdashboard');
        assert.equal(ShellLogic.buildLoginRedirect('https://evil.com'), '/login?redirect=%2Fdashboard');
        assert.equal(ShellLogic.buildLoginRedirect('/automate'), '/login?redirect=%2Fautomate');
    });

    it('tracks the central server clock offset for clock widgets', () => {
        assert.equal(ShellLogic.getServerTimeOffset(), 0);
        assert.equal(ShellLogic.serverNow(1000), 1000);
        // Server is 1s ahead of this device.
        assert.equal(ShellLogic.setServerTime(2000, 1000), 1000);
        assert.equal(ShellLogic.getServerTimeOffset(), 1000);
        assert.equal(ShellLogic.serverNow(1000), 2000);
        // Invalid payloads leave the offset untouched.
        assert.equal(ShellLogic.setServerTime('bogus', 1000), 1000);
        assert.equal(ShellLogic.setServerTime(3000, 'bogus'), 1000);
        assert.equal(ShellLogic.setServerTime(undefined), 1000);
        assert.equal(ShellLogic.getServerTimeOffset(), 1000);
        // Reset so other tests see a zero offset.
        assert.equal(ShellLogic.setServerTime(5000, 5000), 0);
    });

    it('ensureSession returns false without navigating when no fetcher exists', async () => {
        const originalFetch = globalThis.fetch;
        try {
            globalThis.fetch = undefined;
            assert.equal(await ShellLogic.ensureSession(undefined, null), false);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
