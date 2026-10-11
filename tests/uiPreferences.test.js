'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const settingsManager = require('../server/manager/settingsManager');
const { getPrefs } = require('../server/manager/nodePreferencesRegistry');
const uiPreferences = require('../server/manager/uiPreferences');

const snapshotSettings = () => settingsManager.getAllSettings().slice();
const restoreSettings = (snap) => {
    const live = settingsManager.getAllSettings();
    live.length = 0;
    live.push(...snap);
};

describe('uiPreferences default tab', () => {
    let settingsSnap;
    let realSaveSettings;

    beforeEach(() => {
        settingsSnap = snapshotSettings();
        realSaveSettings = settingsManager.saveSettings;
        settingsManager.saveSettings = async () => {};
    });

    afterEach(() => {
        settingsManager.saveSettings = realSaveSettings;
        restoreSettings(settingsSnap);
    });

    it('registers a select preference with Automate/Dashboard/Panels options', () => {
        const pref = getPrefs().find((entry) => entry.id === uiPreferences.DEFAULT_TAB_SETTING);
        assert.ok(pref);
        assert.equal(pref.category, 'Interface');
        assert.equal(pref.type, 'select');
        assert.equal(pref.defaultVal, 'automate');
        assert.deepEqual(
            pref.options.map((opt) => opt.value),
            ['automate', 'dashboard', 'panels']
        );
    });

    it('defaults to /automate and resolves configured tabs', () => {
        assert.equal(uiPreferences.resolveDefaultTab(), 'automate');
        assert.equal(uiPreferences.resolveDefaultTabPath(), '/automate');

        settingsManager.setSetting(uiPreferences.DEFAULT_TAB_SETTING, 'dashboard');
        assert.equal(uiPreferences.resolveDefaultTabPath(), '/dashboard');

        settingsManager.setSetting(uiPreferences.DEFAULT_TAB_SETTING, 'panels');
        assert.equal(uiPreferences.resolveDefaultTabPath(), '/panels');
    });

    it('falls back to automate for invalid values', () => {
        settingsManager.setSetting(uiPreferences.DEFAULT_TAB_SETTING, 'editor');
        assert.equal(uiPreferences.normalizeDefaultTab('EDITOR'), 'automate');
        assert.equal(uiPreferences.resolveDefaultTabPath(), '/automate');
        assert.equal(uiPreferences.normalizeDefaultTab('Dashboard'), 'dashboard');
    });
});
