'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const api = require('../server/manager/smarthomeApi');

const mockRes = () => {
    const res = {
        statusCode: null,
        body: undefined,
        status(code) { res.statusCode = code; return res; },
        json(payload) { res.body = payload; return res; },
        sendStatus(code) { res.statusCode = code; return res; },
    };
    return res;
};

const allowAuth = { canAccessPrivateApi: () => true };
const denyAuth = { canAccessPrivateApi: () => false };

const makeStore = () => {
    const calls = [];
    return {
        calls,
        listDevices: (filters) => { calls.push(['list', filters]); return [{ deviceId: 'd1' }]; },
        setStatus: (id, status) => { calls.push(['status', id, status]); return id === 'd1' ? { deviceId: 'd1', status } : null; },
        rename: (id, patch) => { calls.push(['rename', id, patch]); return id === 'd1' ? { deviceId: 'd1', ...patch } : null; },
        removeDevice: (id) => { calls.push(['remove', id]); return id === 'd1'; },
    };
};

const reqWith = ({ params = {}, query = {}, body = {} } = {}) => ({ params, query, body });

describe('smarthomeApi access control', () => {
    it('rejects unauthenticated callers with 401', () => {
        const store = makeStore();
        const deps = { store, auth: denyAuth };
        for (const [handler, req] of [
            [api.handleListDevices, reqWith()],
            [api.handleSetDeviceStatus, reqWith({ params: { deviceId: 'd1', action: 'approve' } })],
            [api.handleRenameDevice, reqWith({ params: { deviceId: 'd1' }, body: { room: 'Kitchen' } })],
            [api.handleRemoveDevice, reqWith({ params: { deviceId: 'd1' } })],
        ]) {
            const res = mockRes();
            handler(req, res, deps);
            assert.equal(res.statusCode, 401);
        }
        assert.equal(store.calls.length, 0);
    });
});

describe('smarthomeApi device handlers', () => {
    it('lists devices with trimmed filters', () => {
        const store = makeStore();
        const res = mockRes();
        api.handleListDevices(
            reqWith({ query: { status: ' pending ', room: '', capability: 'switch_set' } }),
            res,
            { store, auth: allowAuth }
        );
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.devices.length, 1);
        assert.deepEqual(store.calls[0][1], { status: 'pending', room: undefined, capability: 'switch_set' });
    });

    it('sets status, rejecting bad actions and unknown ids', () => {
        const store = makeStore();
        const deps = { store, auth: allowAuth, onChanged: () => { deps.notified = (deps.notified || 0) + 1; } };
        const ok = mockRes();
        api.handleSetDeviceStatus(reqWith({ params: { deviceId: 'd1', action: 'Approved' } }), ok, deps);
        assert.equal(ok.statusCode, 200);
        assert.equal(ok.body.device.status, 'approved');
        assert.deepEqual(store.calls[0], ['status', 'd1', 'approved']);
        assert.equal(deps.notified, 1);
        const bad = mockRes();
        api.handleSetDeviceStatus(reqWith({ params: { deviceId: 'd1', action: 'launch' } }), bad, deps);
        assert.equal(bad.statusCode, 400);
        const missing = mockRes();
        api.handleSetDeviceStatus(reqWith({ params: { deviceId: 'nope', action: 'deny' } }), missing, deps);
        assert.equal(missing.statusCode, 404);
        assert.equal(deps.notified, 1);
    });

    it('renames devices and validates the patch body', () => {
        const store = makeStore();
        const deps = { store, auth: allowAuth, onChanged: () => { deps.notified = (deps.notified || 0) + 1; } };
        const ok = mockRes();
        api.handleRenameDevice(
            reqWith({ params: { deviceId: 'd1' }, body: { friendlyName: 'Kitchen', room: 'Kitchen' } }),
            ok, deps
        );
        assert.equal(ok.statusCode, 200);
        assert.equal(ok.body.device.friendlyName, 'Kitchen');
        assert.equal(deps.notified, 1);
        const empty = mockRes();
        api.handleRenameDevice(reqWith({ params: { deviceId: 'd1' }, body: {} }), empty, deps);
        assert.equal(empty.statusCode, 400);
        const wrongType = mockRes();
        api.handleRenameDevice(reqWith({ params: { deviceId: 'd1' }, body: { room: 42 } }), wrongType, deps);
        assert.equal(wrongType.statusCode, 400);
        const missing = mockRes();
        api.handleRenameDevice(reqWith({ params: { deviceId: 'nope' }, body: { room: 'X' } }), missing, deps);
        assert.equal(missing.statusCode, 404);
        assert.equal(deps.notified, 1);
    });

    it('removes devices with 204 or 404', () => {
        const store = makeStore();
        let notified = 0;
        const deps = { store, auth: allowAuth, onChanged: () => { notified += 1; } };
        const ok = mockRes();
        api.handleRemoveDevice(reqWith({ params: { deviceId: 'd1' } }), ok, deps);
        assert.equal(ok.statusCode, 204);
        assert.equal(notified, 1);
        const missing = mockRes();
        api.handleRemoveDevice(reqWith({ params: { deviceId: 'nope' } }), missing, deps);
        assert.equal(missing.statusCode, 404);
        assert.equal(notified, 1);
    });
});
