'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const readFrontend = (name) => fs.readFileSync(
    path.join(__dirname, '..', 'frontend', name),
    'utf8'
);

describe('panel pages', () => {
    it('panel.html is a session-gated kiosk surface with no token handling', () => {
        const html = readFrontend('panel.html');
        assert.doesNotMatch(html, /data-shell-tab/);
        assert.match(html, /\/v1\/panels\//);
        assert.doesNotMatch(html, /Authorization/);
        assert.doesNotMatch(html, /\?token=/);
        assert.doesNotMatch(html, /localStorage/);
        assert.doesNotMatch(html, /panelHello/);
        assert.doesNotMatch(html, /panelStatus/);
        for (const id of [
            'panel-login-required',
            'panel-login-link',
            'panel-grid',
            'panel-empty',
        ]) {
            assert.match(html, new RegExp(`id="${id}"`));
        }
        assert.doesNotMatch(html, /id="panel-room"/);
        assert.doesNotMatch(html, /panel-conn/);
        assert.doesNotMatch(html, /id="panel-clock-inline"/);
        assert.doesNotMatch(html, /id="panel-clock-hero"/);
        assert.doesNotMatch(html, /kiosk-header/);
        assert.match(html, /<div class="grid-stack" id="panel-grid">/);
        assert.match(html, /<script src="\/js\/agentMarkdown\.js"><\/script>/);
        assert.match(html, /<script src="\/js\/shell\.js"><\/script>/);
        assert.match(html, /<script src="\/vendor\/gridstack-all\.js"><\/script>/);
        assert.match(html, /<script src="\/js\/widgets\.js"><\/script>/);
        assert.match(html, /Widgets\.createItem/);
        assert.match(html, /staticGrid/);
        assert.match(html, /showBorders/);
        assert.match(html, /no-borders/);
        assert.match(html, /refreshVarContent/);
        assert.match(html, /varsChanged/);
        assert.match(html, /new WebSocket/);
        assert.doesNotMatch(html, /widget-automations/);
        assert.doesNotMatch(html, /widget-weather/);
        assert.doesNotMatch(html, /renderButtons/);
    });

    it('panels.html is a session-gated admin surface', () => {
        const html = readFrontend('panels.html');
        for (const tab of ['dashboard', 'automate', 'panels']) {
            assert.match(html, new RegExp(`data-shell-tab="${tab}"`));
        }
        for (const id of [
            'new-panel-open',
            'panel-create-dialog',
            'panel-create-title',
            'panel-create-close-top',
            'panel-create-cancel',
            'create-panel-btn',
            'new-panel-name',
            'new-panel-room',
            'panels-list',
            'panels-empty',
            'panel-edit-dialog',
            'panel-edit-grid',
            'panel-edit-grid-empty',
            'panel-layout-edit-toggle',
            'panel-add-widget-open',
            'panel-add-widget-dialog',
            'panel-dialog-kind',
            'panel-dialog-preset-track',
            'panel-dialog-size-label',
            'panel-dialog-variable',
            'panel-dialog-automation',
            'panel-dialog-add',
            'edit-panel-name',
            'edit-panel-room',
            'edit-panel-borders',
            'edit-panel-devices',
            'edit-panel-device-search',
            'edit-panel-device-results',
            'edit-panel-device-assigned',
            'edit-panel-device-empty',
        ]) {
            assert.match(html, new RegExp(`id="${id}"`));
        }
        assert.doesNotMatch(html, /id="edit-panel-widgetlist"/);
        assert.doesNotMatch(html, /id="edit-widget-type"/);
        assert.doesNotMatch(html, /id="edit-panel-automations"/);
        assert.doesNotMatch(html, /edit-panel-widgets/);
        assert.doesNotMatch(html, /edit-panel-bindings/);
        assert.doesNotMatch(html, /panel-token-card/);
        assert.doesNotMatch(html, /\?token=/);
        assert.doesNotMatch(html, /\/rotate/);
        assert.doesNotMatch(html, /\/revoke/);
        assert.match(html, /\/v1\/devices/);
        assert.match(html, /deviceIds/);
        assert.match(html, /showBorders/);
        assert.match(html, /\/v1\/panels/);
        assert.match(html, /ensureSession/);
        // Live previews: header button opens the creation dialog, each card
        // paints its widgets with live config data and actions underneath.
        assert.match(html, /panels-header/);
        assert.match(html, /panels-grid/);
        assert.match(html, /panel-preview-card/);
        assert.match(html, /panel-preview-viewport/);
        assert.match(html, /panel-preview-grid-/);
        assert.match(html, /panel-preview-actions/);
        assert.match(html, /\/config/);
        assert.match(html, /\/execute/);
        assert.match(html, /Widgets\.createItem/);
        assert.match(html, /staticGrid/);
        assert.match(html, /renderPanelCard/);
        assert.match(html, /loadPreviewConfig/);
        assert.match(html, /runPreviewAutomation/);
        // The inline "New panel" card is gone; creation lives in the dialog.
        assert.doesNotMatch(html, /aria-label="Create panel"/);
        assert.match(html, /aria-label="New panel"/);
        assert.match(html, /<script src="\/js\/widgetEditor\.js"><\/script>/);
        assert.match(html, /<script src="\/js\/widgets\.js"><\/script>/);
        assert.match(html, /<link rel="stylesheet" href="\/vendor\/gridstack\.min\.css">/);
        assert.match(html, /WidgetEditor\.attach/);
        assert.match(html, /<script src="\/js\/panelDevicePicker\.js"><\/script>/);
        assert.match(html, /PanelDevicePicker\.attach/);
        assert.match(html, /devicePicker\.getDeviceIds/);
        assert.doesNotMatch(html, /edit-panel-devices input\[type="checkbox"\]/);
        assert.match(html, /panel-edit-grid/);
    });
});
