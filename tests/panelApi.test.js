'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const panelApi = require('../server/manager/panelApi');

const graphRoot = {
    nodes: [
        { id: 1, type: 'Triggers/Button', title: 'Porch Light' },
        { id: 2, type: 'Triggers/Cron' },
        { id: 3, type: 'Math/Add' },
    ],
};

function mockRes() {
    const res = {
        statusCode: null,
        body: undefined,
        status(code) {
            res.statusCode = code;
            return res;
        },
        json(payload) {
            res.body = payload;
            return res;
        },
        sendStatus(code) {
            res.statusCode = code;
            return res;
        },
    };
    return res;
}

const adminAuth = { canAccessPrivateApi: () => true };
const noSessionAuth = { canAccessPrivateApi: () => false };

const reqWith = ({ params = {}, body = {}, headers = {}, auth } = {}) => ({
    params,
    body,
    headers,
});

describe('panelApi', () => {
    let tmpDir;
    let store;
    let originalDataDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netsocket-panelapi-'));
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

    it('creates panels for admins and rejects anonymous callers', () => {
        const res = mockRes();
        panelApi.handleCreatePanel(
            reqWith({ body: { name: 'Kitchen' } }),
            res,
            { store, auth: adminAuth }
        );
        assert.equal(res.statusCode, 201);
        assert.equal(res.body.panel.id, 'kitchen');
        assert.ok(!('token' in res.body));

        const denied = mockRes();
        panelApi.handleCreatePanel(
            reqWith({ body: { name: 'Other' } }),
            denied,
            { store, auth: noSessionAuth }
        );
        assert.equal(denied.statusCode, 401);
    });

    it('returns 400 for invalid panel input', () => {
        const res = mockRes();
        panelApi.handleCreatePanel(
            reqWith({ body: { name: '' } }),
            res,
            { store, auth: adminAuth }
        );
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.error, 'name_required');
    });

    it('hides unknown panels from unauthenticated callers (404, not 401)', () => {
        const res = mockRes();
        panelApi.handleGetPanelConfig(
            reqWith({ params: { panelId: 'missing' } }),
            res,
            { store, auth: noSessionAuth, graphRoot }
        );
        assert.equal(res.statusCode, 404);
    });

    it('serves config to sessions and rejects anonymous callers', () => {
        store.createPanel({ name: 'Kitchen', automationIds: ['1'] });

        const ok = mockRes();
        panelApi.handleGetPanelConfig(
            reqWith({ params: { panelId: 'kitchen' } }),
            ok,
            { store, auth: adminAuth, graphRoot }
        );
        assert.equal(ok.statusCode, 200);
        assert.equal(ok.body.panel.id, 'kitchen');
        assert.equal(ok.body.automations.length, 1);
        assert.equal(ok.body.automations[0].title, 'Porch Light');

        const anon = mockRes();
        panelApi.handleGetPanelConfig(
            reqWith({ params: { panelId: 'kitchen' } }),
            anon,
            { store, auth: noSessionAuth, graphRoot }
        );
        assert.equal(anon.statusCode, 401);
    });

    it('exposes only bound variable values in panel config', () => {
        store.createPanel({
            name: 'Kitchen',
            widgets: ['clock', { type: 'markdown', variable: 'briefing' }],
        });
        const varList = [
            { name: 'briefing', value: '# Morning' },
            { name: 'secret_notes', value: 'do not leak' },
        ];
        const res = mockRes();
        panelApi.handleGetPanelConfig(
            reqWith({ params: { panelId: 'kitchen' } }),
            res,
            { store, auth: adminAuth, graphRoot, varList }
        );
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body.variables, { briefing: '# Morning' });
    });

    it('executes only allowlisted runnable nodes', async () => {
        const { panel } = store.createPanel({ name: 'Kitchen', automationIds: ['1', '2'] });
        assert.ok(panel);
        let executed = null;
        const deps = {
            store,
            auth: adminAuth,
            graphRoot,
            executeGraph: async (node) => {
                executed = node;
                return true;
            },
        };

        const ok = mockRes();
        await panelApi.handlePanelExecute(
            reqWith({ params: { panelId: 'kitchen' }, body: { nodeId: 1 } }),
            ok,
            deps
        );
        assert.equal(ok.statusCode, 200);
        assert.deepEqual(ok.body, { ok: true });
        assert.equal(executed.id, 1);

        const missingId = mockRes();
        await panelApi.handlePanelExecute(
            reqWith({ params: { panelId: 'kitchen' }, body: {} }),
            missingId,
            deps
        );
        assert.equal(missingId.statusCode, 400);

        const cron = mockRes();
        await panelApi.handlePanelExecute(
            reqWith({ params: { panelId: 'kitchen' }, body: { nodeId: 2 } }),
            cron,
            deps
        );
        assert.equal(cron.statusCode, 400);
        assert.equal(cron.body.error, 'not_runnable');

        const math = mockRes();
        await panelApi.handlePanelExecute(
            reqWith({ params: { panelId: 'kitchen' }, body: { nodeId: 3 } }),
            math,
            deps
        );
        assert.equal(math.statusCode, 403);
        assert.equal(math.body.error, 'not_allowed');
    });

    it('rejects anonymous execute calls', async () => {
        store.createPanel({ name: 'Kitchen', automationIds: ['1'] });
        const res = mockRes();
        await panelApi.handlePanelExecute(
            reqWith({ params: { panelId: 'kitchen' }, body: { nodeId: 1 } }),
            res,
            {
                store,
                auth: noSessionAuth,
                graphRoot,
                executeGraph: async () => true,
            }
        );
        assert.equal(res.statusCode, 401);
    });

    it('returns 404 when an allowlisted node no longer exists', async () => {
        store.createPanel({ name: 'Kitchen', automationIds: ['999'] });
        const res = mockRes();
        await panelApi.handlePanelExecute(
            reqWith({ params: { panelId: 'kitchen' }, body: { nodeId: '999' } }),
            res,
            {
                store,
                auth: adminAuth,
                graphRoot: { nodes: [] },
                executeGraph: async () => true,
            }
        );
        assert.equal(res.statusCode, 404);
    });

    it('serves panel grants to approved device sockets only', () => {
        store.createPanel({ name: 'Kitchen', deviceIds: ['dev-1'] });
        store.createPanel({ name: 'Office', deviceIds: ['dev-2'] });
        const sent = [];
        const depsFor = (session) => ({
            store,
            deviceAuth: { getSession: () => session },
            reply: (socket, payload) => { sent.push(payload); },
        });
        const socket = { netsocketRole: 'device' };
        const approved = { authenticated: true, approved: true, deviceId: 'dev-1' };

        assert.equal(
            panelApi.handleDevicePanelGrants(socket, { requestId: 'r1' }, depsFor(approved)),
            true
        );
        assert.equal(sent.length, 1);
        assert.equal(sent[0].broadcastPurpose, 'getPanelGrants');
        assert.equal(sent[0].requestId, 'r1');
        assert.deepEqual(sent[0].broadcastData.panels.map((p) => p.id), ['kitchen']);

        assert.equal(
            panelApi.handleDevicePanelGrants(socket, {}, depsFor({ authenticated: true, approved: false, deviceId: 'dev-1' })),
            false
        );
        assert.equal(
            panelApi.handleDevicePanelGrants(socket, {}, depsFor(null)),
            false
        );
        assert.equal(
            panelApi.handleDevicePanelGrants({ netsocketRole: 'editor' }, {}, depsFor(approved)),
            false
        );
        assert.equal(sent.length, 1);
    });

    it('supports admin update and delete with 404s', () => {
        const created = mockRes();
        panelApi.handleCreatePanel(reqWith({ body: { name: 'Den' } }), created, { store, auth: adminAuth });
        assert.equal(created.statusCode, 201);

        const updated = mockRes();
        panelApi.handleUpdatePanel(
            reqWith({ params: { panelId: 'den' }, body: { widgets: [{ type: 'clock', x: 0, y: 0, w: 4, h: 2 }] } }),
            updated,
            { store, auth: adminAuth }
        );
        assert.equal(updated.statusCode, 200);
        assert.deepEqual(updated.body.panel.widgets, [
            { id: 'w1', type: 'clock', x: 0, y: 0, w: 4, h: 2 },
        ]);

        const missingUpdate = mockRes();
        panelApi.handleUpdatePanel(
            reqWith({ params: { panelId: 'nope' }, body: { name: 'X' } }),
            missingUpdate,
            { store, auth: adminAuth }
        );
        assert.equal(missingUpdate.statusCode, 404);

        const anonUpdate = mockRes();
        panelApi.handleUpdatePanel(
            reqWith({ params: { panelId: 'den' }, body: { widgets: ['clock'] } }),
            anonUpdate,
            { store, auth: noSessionAuth }
        );
        assert.equal(anonUpdate.statusCode, 401);

        const deleted = mockRes();
        panelApi.handleDeletePanel(reqWith({ params: { panelId: 'den' } }), deleted, { store, auth: adminAuth });
        assert.equal(deleted.statusCode, 204);

        const deletedAgain = mockRes();
        panelApi.handleDeletePanel(reqWith({ params: { panelId: 'den' } }), deletedAgain, { store, auth: adminAuth });
        assert.equal(deletedAgain.statusCode, 404);
    });
});
