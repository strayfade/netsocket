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
        const editorJs = readFrontend('public/js/widgetEditor.js');
        for (const tab of ['dashboard', 'automate', 'panels']) {
            assert.match(html, new RegExp(`data-shell-tab="${tab}"`));
        }
        for (const id of [
            'dashboard-widgets',
            'add-widget-open',
            'add-widget-dialog',
            'dialog-kind',
            'dialog-variable',
            'dialog-automation',
            'dialog-add',
            'dialog-preset-track',
            'dialog-size-label',
        ]) {
            assert.match(html, new RegExp(`id="${id}"`));
        }
        for (const old of ['layout-kind', 'layout-preset', 'layout-variable', 'layout-automation', 'layout-add', 'layout-list']) {
            assert.doesNotMatch(html, new RegExp(`id="${old}"`));
        }
        assert.match(html, /class="dashboard-toolbar"/);
        assert.match(html, /class="widget-carousel"/);
        assert.match(html, /id="carousel-prev"/);
        assert.match(html, /id="carousel-next"/);
        assert.match(html, />Run Button<\/option>/);
        assert.match(html, />Clock<\/option>/);
        assert.match(html, />Markdown<\/option>/);
        assert.match(html, />HTML<\/option>/);
        assert.doesNotMatch(html, /Run button \(1x1\)/);
        assert.doesNotMatch(html, /Clock \(4x2 or 2x1\)/);
        assert.doesNotMatch(html, /id="layout-list"/);
        assert.match(html, /aria-label="Add widget"/);
        assert.match(html, />Add widget<\/h2>/);
        assert.match(html, /<div class="grid-stack" id="dashboard-widgets">/);
        assert.match(html, /<script src="\/js\/agentMarkdown\.js"><\/script>/);
        assert.match(html, /<script src="\/js\/shell\.js"><\/script>/);
        assert.match(html, /<script src="\/vendor\/gridstack-all\.js"><\/script>/);
        assert.match(html, /<script src="\/js\/widgets\.js"><\/script>/);
        assert.match(html, /<script src="\/js\/widgetEditor\.js"><\/script>/);
        assert.match(html, /<link rel="stylesheet" href="\/vendor\/gridstack\.min\.css">/);
        assert.match(html, /<link rel="stylesheet" href="\/css\/shell\.css">/);
        assert.match(html, /\/v1\/dashboard\/summary/);
        assert.match(html, /\/v1\/dashboard\/run/);
        assert.match(html, /\/v1\/dashboard\/layout/);
        assert.match(html, /WidgetEditor\.attach/);
        assert.match(html, /WidgetEditor\.tickClock/);
        assert.match(editorJs, /GridStack\.init/);
        assert.match(editorJs, /staticGrid/);
        assert.match(editorJs, /setStatic/);
        assert.match(editorJs, /saveGridPositions/);
        assert.match(editorJs, /draggable/);
        assert.match(editorJs, /widget-drag-handle/);
        // Grid/dialog logic now lives in the shared module
        assert.match(editorJs, /sortedPresets/);
        assert.match(editorJs, /renderPresetCarousel/);
        assert.match(editorJs, /selectPreset/);
        assert.match(editorJs, /openAddDialog/);
        assert.match(editorJs, /closeAddDialog/);
        assert.match(editorJs, /handleDialogAdd/);
        assert.match(editorJs, /renderDialogFields/);
        assert.match(editorJs, /dialogPresetIndex/);
        assert.match(editorJs, /carousel-slide/);
        assert.match(editorJs, /carousel-preview/);
        assert.match(html, /carousel-controls/);
        assert.match(html, /dialog-close-btn/);
        assert.doesNotMatch(html, /<label for="dialog-kind">Widget type<\/label>/);
        assert.doesNotMatch(html, /<label>Size<\/label>/);
        assert.doesNotMatch(html, /Markdown and HTML widgets render a netsocket/);
        assert.doesNotMatch(html, /fillPresetOptions/);
        assert.doesNotMatch(html, /id="layout-kind"/);
        assert.match(editorJs, /disableResize/);
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

    it('editor.html uses the shared shell sidebar and floating toolbar and gates on /automate', () => {
        const html = readFrontend('editor.html');
        for (const tab of ['dashboard', 'automate', 'panels']) {
            assert.match(html, new RegExp(`data-shell-tab="${tab}"`));
        }
        assert.match(html, /class="shell-layout"/);
        assert.match(html, /class="shell-sidebar"/);
        assert.match(html, /id="shell-sidebar"/);
        assert.match(html, /class="shell-sidebar-toggle"/);
        assert.match(html, /class="shell-sidebar-backdrop"/);
        assert.match(html, /class="shell-content editor-stage"/);
        assert.match(html, /class="editor-floating-toolbar"/);
        assert.match(html, /id="editor-undo"/);
        assert.match(html, /id="editor-redo"/);
        assert.match(html, /id="editor-fit-view"/);
        assert.match(html, /id="editor-toggle-log"/);
        assert.match(html, /class="shell-sidebar-link/);
        assert.match(html, /id="open-backup"/);
        assert.match(html, /id="open-settings"/);
        assert.match(html, /<link rel="stylesheet" href="\/css\/shell\.css">/);
        assert.match(html, /<script src="\/js\/shell\.js"><\/script>/);
        assert.match(html, /ShellLogic\.markActiveTab\(document\)/);
        assert.match(html, /data-shell-tab="automate" href="\/automate" aria-current="page"/);
        assert.match(html, /class="shell-brand"/);
        // Log Out is now in sidebar bottom
        const logoutStart = html.indexOf('href="/logout"');
        assert.ok(logoutStart !== -1);
        const logoutBlock = html.slice(logoutStart, logoutStart + 400);
        assert.match(logoutBlock, /arrow_outward/);
        assert.doesNotMatch(logoutBlock, /font-variation-settings/);
        assert.match(html, /encodeURIComponent\('\/automate'\)/);
        assert.match(html, /hasConnectedOnce/);
        assert.doesNotMatch(html, />Disconnected</);
        assert.doesNotMatch(html, /editor-brand/);
        assert.doesNotMatch(html, /editor-shell-tabs/);
        assert.doesNotMatch(html, /editor-tabs/);
        assert.match(html, /has-sidebar/);
        assert.match(html, /shell-page/);
    });
});
