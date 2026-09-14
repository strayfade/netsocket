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
