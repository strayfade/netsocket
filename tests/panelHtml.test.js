'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

describe('panel SPA surfaces', () => {
    it('kiosk markup and bootstrap stay session-based with no tokens', () => {
        const markup = read('frontend-app', 'src', 'features', 'kiosk', 'kioskMarkup.html');
        const page = read('frontend-app', 'src', 'features', 'kiosk', 'KioskPage.tsx');
        const bootstrap = read('frontend', 'public', 'js', 'panelKioskBootstrap.js');
        assert.doesNotMatch(markup, /data-shell-tab/);
        assert.doesNotMatch(bootstrap, /Authorization/);
        assert.doesNotMatch(bootstrap, /\?token=/);
        assert.doesNotMatch(bootstrap, /localStorage/);
        for (const id of ['panel-login-required', 'panel-login-link', 'panel-grid', 'panel-empty']) {
            assert.match(markup, new RegExp(`id="${id}"`));
        }
        assert.match(page, /startNetsocketPanelKiosk/);
        assert.match(page, /panelKioskBootstrap\.js/);
        assert.match(bootstrap, /varsChanged/);
        assert.match(bootstrap, /WebSocket/);
        assert.match(bootstrap, /Widgets\.createItem/);
        assert.match(bootstrap, /staticGrid/);
        assert.doesNotMatch(bootstrap, /widget-automations/);
        assert.doesNotMatch(bootstrap, /widget-weather/);
    });

    it('panels admin markup includes CRUD + widget editor hosts', () => {
        const markup = read('frontend-app', 'src', 'features', 'panels', 'panelsMarkup.html');
        const page = read('frontend-app', 'src', 'features', 'panels', 'PanelsPage.tsx');
        const bootstrap = read('frontend', 'public', 'js', 'panelsBootstrap.js');
        const shellCss = read('frontend', 'public', 'css', 'shell.css');
        for (const id of [
            'new-panel-open',
            'panel-create-dialog',
            'panels-list',
            'panels-empty',
            'panel-edit-dialog',
            'panel-edit-grid',
            'panel-layout-edit-toggle',
            'panel-add-widget-open',
            'panel-dialog-kind',
            'panel-dialog-variable',
            'panel-dialog-automation',
            'panel-dialog-show-name',
            'panel-dialog-show-date',
            'panel-dialog-location',
            'panel-dialog-unit',
            'panel-dialog-gradient',
            'panel-dialog-add',
        ]) {
            assert.match(markup, new RegExp(`id="${id}"`));
        }
        // The visible add dialog on /panels is the shared React one; the legacy
        // island dialog above is kept only as its value bridge (open event ->
        // close immediately, replay draft through the panel-dialog-* controls).
        assert.match(page, /AddWidgetDialog/);
        assert.match(page, /panel-add-widget-dialog/);
        assert.match(page, /bridgeObserver\.observe\(/);
        assert.match(page, /panel-react-dialog-anchor/);
        assert.match(page, /panel-dialog-add/);
        assert.match(page, /startNetsocketPanels/);
        assert.match(page, /panelsBootstrap\.js/);
        assert.match(page, /panelDevicePicker\.js/);
        assert.match(bootstrap, /startNetsocketPanels/);
        assert.match(shellCss, /SF UI/);
        assert.ok(fs.existsSync(path.join(__dirname, '..', 'frontend', 'public', 'fonts', 'SFUI.ttf')));
        assert.ok(fs.existsSync(path.join(__dirname, '..', 'frontend', 'public', 'fonts', 'SFUISoft-RegularG4.otf')));
    });

    it('panel bootstraps never pass a fetcher as the NTP resync interval', () => {
        const panels = read('frontend', 'public', 'js', 'panelsBootstrap.js');
        const kiosk = read('frontend', 'public', 'js', 'panelKioskBootstrap.js');
        const ntpBridge = read('frontend-app', 'src', 'lib', 'ntp.ts');
        // The SPA bridge contract is startNtpResync(intervalMs). panelsBootstrap
        // once passed its fetch wrapper (legacy shell.js contract) -> setInterval
        // got NaN -> clamped to ~4ms -> /v1/time fired hundreds of times/second.
        // The bridge also refuses to install a non-finite interval.
        assert.doesNotMatch(panels, /startNtpResync\(\s*api\s*\)/);
        assert.match(panels, /startNtpResync\(\)/);
        assert.match(kiosk, /startNtpResync\(\)/);
        assert.match(ntpBridge, /isFinite/);
    });
});
