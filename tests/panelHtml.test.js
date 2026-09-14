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
            'create-panel-btn',
            'new-panel-name',
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
            'edit-panel-devices',
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
        assert.match(html, /\/v1\/panels/);
        assert.match(html, /ensureSession/);
        assert.match(html, /<script src="\/js\/widgetEditor\.js"><\/script>/);
        assert.match(html, /<script src="\/js\/widgets\.js"><\/script>/);
        assert.match(html, /<link rel="stylesheet" href="\/vendor\/gridstack\.min\.css">/);
        assert.match(html, /WidgetEditor\.attach/);
        assert.match(html, /panel-edit-grid/);
    });
});
