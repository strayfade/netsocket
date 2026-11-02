'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

describe('React hub shell + dashboard', () => {
    it('puts Automate first in the sidebar nav', () => {
        const sidebar = read('frontend-app', 'src', 'components', 'shell', 'AppSidebar.tsx');
        const automate = sidebar.indexOf("id: 'automate'");
        const dashboard = sidebar.indexOf("id: 'dashboard'");
        const panels = sidebar.indexOf("id: 'panels'");
        assert.ok(automate !== -1 && dashboard !== -1 && panels !== -1);
        assert.ok(automate < dashboard, 'Automate should precede Dashboard');
        assert.ok(dashboard < panels, 'Dashboard should precede Panels');
    });

    it('dashboard + panel editors share the shadcn AddWidgetDialog', () => {
        const page = read('frontend-app', 'src', 'features', 'dashboard', 'DashboardPage.tsx');
        const dialog = read('frontend-app', 'src', 'features', 'widgets', 'AddWidgetDialog.tsx');
        const editorJs = read('frontend', 'public', 'js', 'widgetEditor.js');
        assert.match(page, /components\/ui\/combobox/);
        assert.match(page, /AddWidgetDialog/);
        assert.match(dialog, /components\/ui\/combobox/);
        assert.match(dialog, /components\/ui\/switch/);
        assert.match(dialog, /components\/ui\/dialog/);
        assert.match(dialog, /components\/ui\/field/);
        assert.match(page, /components\/ui\/button-group/);
        assert.match(page, /components\/ui\/skeleton/);
        assert.match(page, /components\/ui\/context-menu/);
        assert.match(page, /dashboard-widgets/);
        assert.match(page, /\/js\/widgets\.js/);
        assert.match(page, /\/vendor\/gridstack-all\.js/);
        assert.match(page, /GridStack/);
        assert.match(editorJs, /GridStack\.init/);
        assert.match(editorJs, /widget-drag-handle/);
    });

    it('automate page mounts LiteGraph island with shadcn toolbar', () => {
        const page = read('frontend-app', 'src', 'features', 'automate', 'AutomatePage.tsx');
        const bootstrap = read('frontend', 'public', 'js', 'editorBootstrap.js');
        assert.match(page, /id="nodegraph"/);
        assert.match(page, /id="log"/);
        assert.match(page, /editor-undo/);
        assert.match(page, /ButtonGroup/);
        assert.match(page, /startNetsocketEditor/);
        assert.match(page, /\/js\/editorBootstrap\.js/);
        assert.match(bootstrap, /startNetsocketEditor/);
        assert.match(bootstrap, /__netsocketEditorApi/);
    });

    it('log backlog handler declares its loop variable (strict mode)', () => {
        const bootstrap = read('frontend', 'public', 'js', 'editorBootstrap.js');
        assert.match(bootstrap, /^\(function \(\) \{\s*\n\s*'use strict';/, 'bootstrap runs in strict mode');
        const handler = bootstrap.match(/case "populateLog":[\s\S]*?scrollToBottom\(\)/);
        assert.ok(handler, 'populateLog handler should build the log backlog');
        // An undeclared loop variable in strict mode throws "i is not defined", so #log stays empty.
        assert.doesNotMatch(handler[0], /for \((?!const|let|var)\s*\w+\s+of /);
        assert.match(handler[0], /for \(const \w+ of parsedMessage\.broadcastData\)/);
    });

    it('automate page keeps legacy editor-page styles off the shell buttons', () => {
        const page = read('frontend-app', 'src', 'features', 'automate', 'AutomatePage.tsx');
        const globals = read('frontend-app', 'src', 'styles', 'globals.css');
        const islandCss = read('frontend', 'public', 'litegraph-editor.css');
        const added = page.match(/body\.classList\.add\(([^)]*)\)/);
        assert.ok(added, 'automate page should set its body classes');
        // litegraph-editor.css loads after the Tailwind bundle, so body.litegraph-editor outranks
        // hover:bg-accent and repaints every shell <button> near-white on hover.
        assert.ok(
            !added[1].includes("'litegraph-editor'"),
            'legacy litegraph-editor page class must not be applied to <body>'
        );
        assert.match(added[1], /'litegraph'/, 'the island still needs body.litegraph for litegraph.css');
        assert.match(islandCss, /\.litegraph-editor button:hover/);
        assert.match(globals, /body\.litegraph\s*\{[^}]*font-size:\s*14px/);
    });
});
