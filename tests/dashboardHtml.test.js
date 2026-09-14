'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const readFrontend = (name) => fs.readFileSync(
    path.join(__dirname, '..', 'frontend', name),
    'utf8'
);

describe('dashboard shell pages', () => {
    it('dashboard.html renders a GridStack grid with safe content slots', () => {
        const html = readFrontend('dashboard.html');
        for (const tab of ['dashboard', 'automate', 'panels']) {
            assert.match(html, new RegExp(`data-shell-tab="${tab}"`));
        }
        for (const id of [
            'dashboard-widgets',
            'layout-list',
            'layout-kind',
            'layout-preset',
            'layout-variable',
            'layout-automation',
            'layout-add',
        ]) {
            assert.match(html, new RegExp(`id="${id}"`));
        }
        assert.match(html, /<div class="grid-stack" id="dashboard-widgets">/);
        assert.match(html, /<script src="\/js\/agentMarkdown\.js"><\/script>/);
        assert.match(html, /<script src="\/js\/shell\.js"><\/script>/);
        assert.match(html, /<script src="\/vendor\/gridstack-all\.js"><\/script>/);
        assert.match(html, /<script src="\/js\/widgets\.js"><\/script>/);
        assert.match(html, /<link rel="stylesheet" href="\/vendor\/gridstack\.min\.css">/);
        assert.match(html, /<link rel="stylesheet" href="\/css\/shell\.css">/);
        assert.match(html, /\/v1\/dashboard\/summary/);
        assert.match(html, /\/v1\/dashboard\/run/);
        assert.match(html, /\/v1\/dashboard\/layout/);
        assert.match(html, /Widgets\.createItem/);
        assert.match(html, /GridStack\.init/);
        assert.match(html, /staticGrid/);
        assert.match(html, /id="layout-edit-toggle"/);
        assert.match(html, /setStatic/);
        assert.match(html, /saveGridPositions/);
        assert.match(html, /draggable/);
        assert.match(html, /widget-drag-handle/);
        assert.match(html, /disableResize/);
        assert.match(html, /droppedLegacy/);
        assert.match(html, /layoutToast\.v2/);
        assert.doesNotMatch(html, /renderStatsCard/);
        assert.doesNotMatch(html, /renderAutomationsCard/);
    });

    it('shell headers show the logo only, without brand text', () => {
        for (const name of ['dashboard.html', 'panels.html', 'editor.html']) {
            const html = readFrontend(name);
            assert.doesNotMatch(html, /<span>netsocket<\/span>/);
            assert.match(html, /class="shell-brand"/);
        }
    });

    it('panels.html shares the tab nav and points forward to Pass 2', () => {
        const html = readFrontend('panels.html');
        for (const tab of ['dashboard', 'automate', 'panels']) {
            assert.match(html, new RegExp(`data-shell-tab="${tab}"`));
        }
        assert.match(html, /\/panel\//);
        assert.match(html, /<script src="\/js\/shell\.js"><\/script>/);
    });

    it('editor.html uses the shared shell topbar and gates on /automate', () => {
        const html = readFrontend('editor.html');
        for (const tab of ['dashboard', 'automate', 'panels']) {
            assert.match(html, new RegExp(`data-shell-tab="${tab}"`));
        }
        assert.match(html, /<header class="shell-topbar">/);
        assert.match(html, /<link rel="stylesheet" href="\/css\/shell\.css">/);
        assert.match(html, /<script src="\/js\/shell\.js"><\/script>/);
        assert.match(html, /ShellLogic\.markActiveTab\(document\)/);
        assert.match(html, /data-shell-tab="automate" href="\/automate" aria-current="page"/);
        assert.match(html, /class="shell-brand"/);
        assert.match(html, /class="shell-topbar-link"/);
        // Log Out matches Dashboard/Panels exactly: same label class, plain
        // icon (inherits 18px / wght 400), no inline variation style.
        const logoutStart = html.indexOf('href="/logout"');
        assert.ok(logoutStart !== -1);
        const logoutBlock = html.slice(logoutStart, logoutStart + 400);
        assert.match(logoutBlock, /<span class="shell-tab-label">Log Out<\/span>/);
        assert.match(logoutBlock, /<span class="material-symbols-outlined" aria-hidden="true">arrow_outward<\/span>/);
        assert.doesNotMatch(logoutBlock, /font-variation-settings/);
        assert.match(html, /encodeURIComponent\('\/automate'\)/);
        assert.match(html, /hasConnectedOnce/);
        assert.doesNotMatch(html, />Disconnected</);
        assert.doesNotMatch(html, /editor-brand/);
        assert.doesNotMatch(html, /editor-shell-tabs/);
        assert.doesNotMatch(html, /editor-tabs/);
    });
});
