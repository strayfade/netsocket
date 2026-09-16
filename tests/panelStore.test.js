'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('panelStore', () => {
    let tmpDir;
    let store;
    let originalDataDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netsocket-panels-'));
        originalDataDir = process.env.DATA_DIR;
        process.env.DATA_DIR = tmpDir;
        delete require.cache[require.resolve('../server/config')];
        delete require.cache[require.resolve('../server/manager/panelStore')];
        store = require('../server/manager/panelStore');
        store.resetForTests();
    });

    afterEach(() => {
        if (originalDataDir === undefined) delete process.env.DATA_DIR;
        else process.env.DATA_DIR = originalDataDir;
        delete require.cache[require.resolve('../server/config')];
        delete require.cache[require.resolve('../server/manager/panelStore')];
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch { /* ignore */ }
    });

    it('creates a blank panel with no widgets by default', () => {
        const { panel } = store.createPanel({ name: 'Kitchen', room: 'Kitchen' });
        assert.equal(panel.id, 'kitchen');
        assert.deepEqual(panel.widgets, []);
        assert.ok(!('tokenHash' in panel));
        assert.ok(!('token' in panel));
        assert.ok(!('deviceTokens' in panel));
    });

    it('rejects invalid input without creating panels', () => {
        assert.throws(() => store.createPanel({}), /name_required/);
        assert.throws(() => store.createPanel({ name: '  ' }), /name_required/);
        assert.throws(() => store.createPanel({ name: 'X', widgets: [{ type: 'stats', x: 0, y: 0, w: 1, h: 1 }] }), /invalid_type/);
        assert.throws(() => store.createPanel({ name: 'X', widgets: 'clock' }), /invalid_widgets/);
        assert.throws(() => store.createPanel({ name: 'X', id: 'BAD ID!' }), /invalid_id/);
        assert.equal(store.listPanels().length, 0);
    });

    it('accepts positioned grid widgets', () => {
        const { panel } = store.createPanel({
            name: 'Kitchen',
            widgets: [
                { type: 'clock', x: 0, y: 0, w: 4, h: 2 },
                { type: 'markdown', x: 4, y: 0, w: 4, h: 2, variable: ' briefing ' },
                { id: 'run9', type: 'button', x: 8, y: 0, w: 1, h: 1, automationId: '9' },
            ],
        });
        assert.deepEqual(panel.widgets, [
            { id: 'w1', type: 'clock', x: 0, y: 0, w: 4, h: 2 },
            { id: 'w2', type: 'markdown', x: 4, y: 0, w: 4, h: 2, variable: 'briefing' },
            { id: 'run9', type: 'button', x: 8, y: 0, w: 1, h: 1, automationId: '9' },
        ]);
        assert.deepEqual(store.boundVariableNames(store.getPanel('kitchen')), ['briefing']);
    });

    it('rejects invalid grid widgets', () => {
        assert.throws(
            () => store.createPanel({ name: 'X', widgets: [{ type: 'markdown', x: 0, y: 0, w: 1, h: 1 }] }),
            /variable_required/
        );
        assert.throws(
            () => store.createPanel({ name: 'X', widgets: [{ type: 'button', x: 0, y: 0, w: 1, h: 1 }] }),
            /automation_required/
        );
        assert.throws(
            () => store.createPanel({ name: 'X', widgets: [{ type: 'clock', x: 11, y: 0, w: 2, h: 1 }] }),
            /invalid_widget/
        );
    });

    it('migrates legacy panel widgets on load', () => {
        const panelsPath = require('../server/config').config.storage.panels;
        fs.writeFileSync(panelsPath, JSON.stringify({
            version: 1,
            panels: {
                old: {
                    id: 'old', name: 'Old', room: '', automationIds: ['3', '4'],
                    widgets: ['clock', 'automations', 'weather', { type: 'markdown', variable: 'notes' }, 'bogus'],
                    deviceIds: [], createdAt: 1, updatedAt: 2, lastSeenAt: null,
                },
                mixed: {
                    id: 'mixed', name: 'Mixed', room: '', automationIds: ['3'],
                    widgets: ['clock', { type: 'clock', x: 0, y: 0, w: 4, h: 2 }, { type: 'button', automationId: '3' }],
                    deviceIds: [], createdAt: 1, updatedAt: 2, lastSeenAt: null,
                },
            },
        }));
        delete require.cache[require.resolve('../server/manager/panelStore')];
        const reloaded = require('../server/manager/panelStore');
        const found = reloaded.getPanelPublic('old');
        // With allowlist removed, legacy 'automations' toggle expands to zero buttons (all automations are implicit now).
        assert.deepEqual(found.widgets.map((w) => w.type), ['clock', 'markdown']);
        assert.deepEqual(
            found.widgets.filter((w) => w.type === 'button').map((w) => w.automationId),
            []
        );
        assert.deepEqual(found.automationIds, []);
        const mixed = reloaded.getPanelPublic('mixed');
        assert.deepEqual(mixed.widgets.map((w) => w.type), ['clock', 'clock', 'button']);
        reloaded.resetForTests();
    });

    it('adds a clock to an html panel via update (Panels Edit dialog flow)', () => {
        const { panel } = store.createPanel({
            name: 'kd2',
            room: 'kitchen',
            widgets: [{ type: 'html', variable: 'tes' }],
            deviceIds: ['13391fca-6e7a-e892-2202-e8254697f8ed'],
        });
        const editingWidgets = (panel.widgets || []).map((w) => ({
            id: w.id,
            type: w.type,
            x: w.x || 0,
            y: w.y || 0,
            w: w.w || 1,
            h: w.h || 1,
            automationId: w.automationId,
            variable: w.variable,
        }));
        editingWidgets.push({ type: 'clock', x: 0, y: 0, w: 4, h: 2 });
        const updated = store.updatePanel(panel.id, {
            name: panel.name,
            room: panel.room,
            widgets: editingWidgets,
            deviceIds: ['13391fca-6e7a-e892-2202-e8254697f8ed'],
        });
        assert.deepEqual(updated.widgets.map((w) => w.type), ['html', 'clock']);
        assert.equal(updated.widgets[1].w, 4);
        assert.equal(updated.widgets[1].h, 2);
    });

    it('grants devices to panels and lists their panels', () => {
        store.createPanel({ name: 'Kitchen', deviceIds: ['dev-1', 'dev-1'] });
        store.createPanel({ name: 'Office', deviceIds: ['dev-2'] });
        const kitchen = store.getPanelPublic('kitchen');
        assert.deepEqual(kitchen.deviceIds, ['dev-1']);
        const granted = store.panelsForDevice('dev-1');
        assert.equal(granted.length, 1);
        assert.equal(granted[0].id, 'kitchen');
        assert.ok(!('tokenHash' in granted[0]));
        assert.deepEqual(store.panelsForDevice('unknown'), []);
        assert.deepEqual(store.panelsForDevice(''), []);
    });

    it('rejects invalid device grants', () => {
        assert.throws(() => store.createPanel({ name: 'X', deviceIds: 'dev-1' }), /invalid_device_ids/);
        assert.throws(() => store.createPanel({ name: 'X', deviceIds: [''] }), /invalid_device_ids/);
        assert.throws(() => store.createPanel({ name: 'X', deviceIds: [42] }), /invalid_device_ids/);
        assert.throws(
            () => store.createPanel({ name: 'X', deviceIds: Array.from({ length: 21 }, (_, i) => `d${i}`) }),
            /invalid_device_ids/
        );
        const { panel } = store.createPanel({ name: 'Y' });
        assert.throws(() => store.updatePanel(panel.id, { deviceIds: ['ok', ''] }), /invalid_device_ids/);
    });

    it('verifies device grants and drops them on unassign', () => {
        store.createPanel({ name: 'Kitchen', deviceIds: ['dev-1'] });
        assert.ok(store.verifyDeviceForPanel('dev-1', 'kitchen'));
        assert.equal(store.verifyDeviceForPanel('dev-2', 'kitchen'), null);
        assert.equal(store.verifyDeviceForPanel('dev-1', 'missing'), null);
        assert.equal(store.verifyDeviceForPanel('', 'kitchen'), null);

        store.updatePanel('kitchen', { deviceIds: [] });
        assert.equal(store.verifyDeviceForPanel('dev-1', 'kitchen'), null);
        assert.deepEqual(store.panelsForDevice('dev-1'), []);
    });

    it('drops legacy token material on load', () => {
        const panelsPath = require('../server/config').config.storage.panels;
        fs.writeFileSync(panelsPath, JSON.stringify({
            version: 1,
            panels: {
                legacy: {
                    id: 'legacy', name: 'Legacy', room: '', widgets: [], automationIds: [],
                    deviceIds: [], tokenHash: 'abc', deviceTokens: [{ deviceId: 'd', tokenHash: 'x' }],
                    revoked: true, createdAt: 1, updatedAt: 2, lastSeenAt: null,
                },
            },
        }));
        delete require.cache[require.resolve('../server/manager/panelStore')];
        const reloaded = require('../server/manager/panelStore');
        const found = reloaded.getPanelPublic('legacy');
        assert.ok(!('tokenHash' in found));
        assert.ok(!('revoked' in found));
        assert.deepEqual(found.deviceIds, []);
        reloaded.resetForTests();
    });

    it('rejects duplicate ids and uniquifies generated slugs', () => {
        store.createPanel({ id: 'kitchen', name: 'Kitchen' });
        assert.throws(() => store.createPanel({ id: 'kitchen', name: 'Other' }), /id_taken/);
        const second = store.createPanel({ name: 'Kitchen' });
        assert.equal(second.panel.id, 'kitchen-2');
    });

    it('updates room/widgets and deletes panels', () => {
        const { panel } = store.createPanel({ name: 'Office' });
        const updated = store.updatePanel(panel.id, {
            room: 'Office',
            widgets: [{ type: 'clock', x: 0, y: 0, w: 4, h: 2 }],
        });
        assert.equal(updated.room, 'Office');
        assert.deepEqual(updated.widgets, [
            { id: 'w1', type: 'clock', x: 0, y: 0, w: 4, h: 2 },
        ]);
        // automationIds is deprecated; always []
        assert.deepEqual(updated.automationIds, []);
        assert.throws(() => store.updatePanel(panel.id, { widgets: [{ type: 'nope', x: 0, y: 0, w: 1, h: 1 }] }), /invalid_type/);
        assert.equal(store.updatePanel('missing', { name: 'X' }), null);

        assert.equal(store.deletePanel(panel.id), true);
        assert.equal(store.deletePanel(panel.id), false);
        assert.equal(store.getPanelPublic(panel.id), null);
    });

    it('defaults widget borders on and toggles them per panel', () => {
        const created = store.createPanel({ name: 'Kitchen' });
        assert.equal(created.panel.showBorders, true);

        const borderless = store.createPanel({ name: 'Porch', showBorders: false });
        assert.equal(borderless.panel.showBorders, false);

        const updated = store.updatePanel(borderless.panel.id, { showBorders: true });
        assert.equal(updated.showBorders, true);
        assert.equal(store.updatePanel(borderless.panel.id, { showBorders: false }).showBorders, false);

        assert.throws(() => store.createPanel({ name: 'Bad', showBorders: 'yes' }), /invalid_show_borders/);
        assert.throws(() => store.updatePanel('kitchen', { showBorders: 1 }), /invalid_show_borders/);
        // Failed updates leave the stored value untouched.
        assert.equal(store.getPanelPublic('kitchen').showBorders, true);
    });

    it('migrates legacy panels without a border flag to borders-on', () => {
        const panelsPath = require('../server/config').config.storage.panels;
        fs.writeFileSync(panelsPath, JSON.stringify({
            version: 1,
            panels: {
                legacy: {
                    id: 'legacy', name: 'Legacy', room: '', widgets: [], automationIds: [],
                    deviceIds: [], createdAt: 1, updatedAt: 2, lastSeenAt: null,
                },
            },
        }));
        delete require.cache[require.resolve('../server/manager/panelStore')];
        const reloaded = require('../server/manager/panelStore');
        assert.equal(reloaded.getPanelPublic('legacy').showBorders, true);
        reloaded.resetForTests();
    });

    it('persists panels across a simulated restart', () => {
        const { panel } = store.createPanel({ name: 'Porch', widgets: [{ type: 'clock', x: 0, y: 0, w: 4, h: 2 }] });
        delete require.cache[require.resolve('../server/manager/panelStore')];
        const reloaded = require('../server/manager/panelStore');
        const found = reloaded.getPanelPublic(panel.id);
        assert.equal(found.name, 'Porch');
        assert.deepEqual(found.automationIds, []);
    });
});
