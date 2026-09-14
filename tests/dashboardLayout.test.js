'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('dashboardLayout', () => {
    let tmpDir;
    let layout;
    let originalDataDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netsocket-dlayout-'));
        originalDataDir = process.env.DATA_DIR;
        process.env.DATA_DIR = tmpDir;
        delete require.cache[require.resolve('../server/config')];
        delete require.cache[require.resolve('../server/manager/dashboardLayout')];
        layout = require('../server/manager/dashboardLayout');
        layout.resetForTests();
    });

    afterEach(() => {
        if (originalDataDir === undefined) delete process.env.DATA_DIR;
        else process.env.DATA_DIR = originalDataDir;
        delete require.cache[require.resolve('../server/config')];
        delete require.cache[require.resolve('../server/manager/dashboardLayout')];
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch { /* ignore */ }
    });

    it('seeds a default layout on first load', () => {
        delete require.cache[require.resolve('../server/manager/dashboardLayout')];
        const fresh = require('../server/manager/dashboardLayout');
        assert.deepEqual(fresh.getLayout().widgets, [
            { id: 'w1', type: 'clock', x: 0, y: 0, w: 4, h: 2 },
        ]);
        assert.deepEqual(fresh.boundVariableNames(), []);
        assert.ok(fs.existsSync(path.join(tmpDir, 'dashboard.json')));
    });

    it('accepts positioned grid widgets bound to variables', () => {
        const result = layout.replaceLayout([
            { type: 'markdown', x: 0, y: 0, w: 4, h: 2, variable: ' morning_briefing ' },
            { type: 'button', x: 4, y: 0, w: 1, h: 1, automationId: '3' },
            { type: 'clock', x: 5, y: 0, w: 4, h: 2 },
        ]);
        assert.equal(result.widgets[0].variable, 'morning_briefing');
        assert.equal(result.widgets[0].id, 'w1');
        assert.equal(result.widgets[1].automationId, '3');
        assert.deepEqual(layout.boundVariableNames(), ['morning_briefing']);
    });

    it('rejects invalid layouts without changing state', () => {
        assert.throws(() => layout.replaceLayout('nope'), /invalid_layout/);
        assert.throws(() => layout.replaceLayout([{ type: 'stats', x: 0, y: 0, w: 1, h: 1 }]), /invalid_type/);
        assert.throws(() => layout.replaceLayout([{ type: 'weather', x: 0, y: 0, w: 1, h: 1 }]), /invalid_type/);
        assert.throws(() => layout.replaceLayout([{ type: 'markdown', x: 0, y: 0, w: 1, h: 1 }]), /variable_required/);
        assert.throws(() => layout.replaceLayout([{ type: 'button', x: 0, y: 0, w: 1, h: 1 }]), /automation_required/);
        assert.throws(
            () => layout.replaceLayout(
                Array.from({ length: 101 }, () => ({ type: 'clock', x: 0, y: 0, w: 4, h: 2 }))
            ),
            /too_many_widgets/
        );
        assert.deepEqual(layout.getLayout().widgets, []);
    });

    it('migrates v1 layouts and counts dropped legacy kinds', () => {
        fs.writeFileSync(path.join(tmpDir, 'dashboard.json'), JSON.stringify({
            version: 1,
            widgets: [
                { kind: 'stats' },
                { kind: 'automations' },
                { kind: 'clock' },
                { kind: 'markdown', variable: 'notes' },
                { kind: 'weather' },
            ],
        }), 'utf8');
        delete require.cache[require.resolve('../server/manager/dashboardLayout')];
        const reloaded = require('../server/manager/dashboardLayout');
        const migrated = reloaded.getLayout();
        assert.deepEqual(migrated.widgets.map((w) => w.type), ['clock', 'markdown']);
        assert.deepEqual(migrated.droppedLegacy, { stats: 1, automations: 1, weather: 1 });
        assert.deepEqual(reloaded.boundVariableNames(), ['notes']);
        reloaded.resetForTests();
    });

    it('persists the layout across a simulated restart', () => {
        layout.replaceLayout([{ type: 'markdown', x: 0, y: 0, w: 4, h: 2, variable: 'notes' }]);
        delete require.cache[require.resolve('../server/manager/dashboardLayout')];
        const reloaded = require('../server/manager/dashboardLayout');
        const widgets = reloaded.getLayout().widgets;
        assert.equal(widgets.length, 1);
        assert.equal(widgets[0].variable, 'notes');
    });

    it('falls back to an empty layout on corrupt files', () => {
        fs.writeFileSync(path.join(tmpDir, 'dashboard.json'), '{broken', 'utf8');
        delete require.cache[require.resolve('../server/manager/dashboardLayout')];
        const reloaded = require('../server/manager/dashboardLayout');
        assert.deepEqual(reloaded.getLayout().widgets, []);
    });
});
