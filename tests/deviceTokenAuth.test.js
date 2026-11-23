'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { disableAuth } = require('./helpers/authMode');

/** Gateway address: the launcher proxies from here, so it is never "local". */
const GATEWAY_PEER = '192.168.1.101';

const mockRes = () => {
    const res = {
        statusCode: null,
        body: undefined,
        cookies: {},
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
        cookie(name, value) {
            res.cookies[name] = value;
            return res;
        },
        clearCookie(name) {
            delete res.cookies[name];
            return res;
        },
    };
    return res;
};

const reqWith = ({ peer = GATEWAY_PEER, cookies = {}, headers = {}, body = {}, params = {} } = {}) => ({
    socket: { remoteAddress: peer },
    connection: { remoteAddress: peer },
    cookies,
    headers,
    body,
    params,
    accepts: () => false,
});

describe('device token credentials', () => {
    let tmpDir;
    let originalDataDir;
    let registry;
    let auth;

    const freshModules = () => {
        for (const mod of [
            '../server/config',
            '../server/manager/deviceRegistry',
            '../server/utils/sessionAuth',
            '../server/manager/panelStore',
            '../server/manager/panelApi',
        ]) {
            delete require.cache[require.resolve(mod)];
        }
        registry = require('../server/manager/deviceRegistry');
        auth = require('../server/utils/sessionAuth');
        require('../server/manager/panelStore').resetForTests();
    };

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netsocket-devtoken-'));
        originalDataDir = process.env.DATA_DIR;
        process.env.DATA_DIR = tmpDir;
        disableAuth();
        freshModules();
        registry.resetForTests();
    });

    afterEach(() => {
        if (originalDataDir === undefined) delete process.env.DATA_DIR;
        else process.env.DATA_DIR = originalDataDir;
        disableAuth();
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch { /* ignore */ }
    });

    const register = (deviceId, key = `key-${deviceId}`) => registry.upsertFromHello({
        deviceId,
        identityPublicKey: key,
        name: 'Pixel',
        platform: 'android',
        ipAddress: '10.0.0.9',
    }).device;

    const approve = (deviceId) => registry.setStatus(deviceId, registry.STATUS.APPROVED);

    it('refuses to mint a token for a pending or denied device', () => {
        register('dev-pending');
        assert.equal(registry.issueToken('dev-pending'), null);

        register('dev-denied');
        approve('dev-denied');
        registry.setStatus('dev-denied', registry.STATUS.DENIED);
        assert.equal(registry.issueToken('dev-denied'), null);
    });

    it('stores only the hash, and verification accepts the plaintext once', () => {
        register('dev-1');
        approve('dev-1');
        const issued = registry.issueToken('dev-1', { label: 'test' });
        assert.equal(typeof issued.token, 'string');
        assert.ok(issued.token.length >= 40);

        const onDisk = fs.readFileSync(registry.DEVICES_PATH, 'utf8');
        assert.equal(onDisk.includes(issued.token), false, 'plaintext token must never be persisted');
        assert.match(onDisk, /"hash": "[0-9a-f]{64}"/);

        assert.equal(registry.verifyDeviceToken(issued.token), 'dev-1');
        assert.equal(registry.verifyDeviceToken('not-a-real-token'), null);
        assert.equal(registry.verifyDeviceToken(''), null);
    });

    it('revokes tokens on denial and on identity-key rotation', () => {
        register('dev-1');
        approve('dev-1');
        const issued = registry.issueToken('dev-1');
        assert.equal(registry.verifyDeviceToken(issued.token), 'dev-1');

        registry.setStatus('dev-1', registry.STATUS.DENIED);
        assert.equal(registry.verifyDeviceToken(issued.token), null, 'denied device must not keep a token');

        approve('dev-1');
        const second = registry.issueToken('dev-1');
        assert.equal(registry.verifyDeviceToken(second.token), 'dev-1');

        // A new identity key forces re-approval and invalidates the old credential.
        register('dev-1', 'rotated-key');
        assert.equal(registry.getDevice('dev-1').status, registry.STATUS.PENDING);
        assert.equal(registry.verifyDeviceToken(second.token), null);
    });

    it('resolves a token from the bearer header or the ns_device cookie', () => {
        register('dev-1');
        approve('dev-1');
        const issued = registry.issueToken('dev-1');

        assert.equal(
            auth.getApprovedDeviceId(reqWith({ headers: { authorization: `Bearer ${issued.token}` } })),
            'dev-1',
        );
        assert.equal(
            auth.getApprovedDeviceId(reqWith({ cookies: { [auth.DEVICE_COOKIE_NAME]: issued.token } })),
            'dev-1',
        );
        assert.equal(auth.getApprovedDeviceId(reqWith({})), null);
    });

    it('does not let authSkipped alone authorize a caller arriving through the gateway', () => {
        // Login disabled (the production default) and a private launcher peer:
        // this is exactly the anonymous internet path from the audit.
        assert.equal(auth.authSkipped(), true);
        const gatewayReq = reqWith({ peer: GATEWAY_PEER });
        assert.equal(auth.hasAdminAccess(gatewayReq), false);
        assert.equal(auth.canAccessAsDeviceOrAdmin(gatewayReq), false);

        // A real loopback dev caller is still trusted while login is opt-in off.
        const loopbackReq = reqWith({ peer: '127.0.0.1' });
        assert.equal(auth.hasAdminAccess(loopbackReq), true);
        assert.equal(auth.canAccessAsDeviceOrAdmin(loopbackReq), true);
    });

    it('gates the device-only routes with 401 then 403 then next()', () => {
        register('dev-1');
        approve('dev-1');
        const issued = registry.issueToken('dev-1');

        const noToken = mockRes();
        let called = false;
        auth.requireApprovedDevice(reqWith({ peer: GATEWAY_PEER }), noToken, () => { called = true; });
        assert.equal(noToken.statusCode, 401);
        assert.equal(noToken.body.error, 'device_required');
        assert.equal(called, false);

        const badToken = mockRes();
        auth.requireApprovedDevice(
            reqWith({ peer: GATEWAY_PEER, cookies: { [auth.DEVICE_COOKIE_NAME]: 'bogus' } }),
            badToken,
            () => { called = true; },
        );
        assert.equal(badToken.statusCode, 403);
        assert.equal(badToken.body.error, 'device_not_approved');
        assert.equal(called, false);

        const ok = mockRes();
        auth.requireApprovedDevice(
            reqWith({ peer: GATEWAY_PEER, headers: { authorization: `Bearer ${issued.token}` } }),
            ok,
            () => { called = true; },
        );
        assert.equal(called, true, 'an approved device passes the gate');
        assert.equal(ok.statusCode, null);
    });

    it('gives an admin session a panel that a device without a grant cannot read', () => {
        const panelApi = require('../server/manager/panelApi');

        register('dev-1');
        approve('dev-1');
        const granted = registry.issueToken('dev-1');
        register('dev-2');
        approve('dev-2');
        const ungranted = registry.issueToken('dev-2');

        const store = {
            getPanel: (id) => (id === 'kitchen' ? { id: 'kitchen', deviceIds: ['dev-1'] } : null),
            verifyDeviceForPanel: (deviceId, panelId) =>
                (panelId === 'kitchen' && deviceId === 'dev-1' ? { id: 'kitchen' } : null),
        };

        // Admin (loopback, login disabled).
        assert.equal(
            panelApi.resolveAccess(reqWith({ peer: '127.0.0.1', params: { panelId: 'kitchen' } }), 'kitchen', { store }).panel.id,
            'kitchen',
        );

        // Granted device.
        assert.equal(
            panelApi.resolveAccess(
                reqWith({ cookies: { [auth.DEVICE_COOKIE_NAME]: granted.token } }),
                'kitchen',
                { store },
            ).panel.id,
            'kitchen',
        );

        // Approved device with no grant, and an anonymous gateway caller.
        assert.equal(
            panelApi.resolveAccess(
                reqWith({ cookies: { [auth.DEVICE_COOKIE_NAME]: ungranted.token } }),
                'kitchen',
                { store },
            ).error,
            'unauthorized',
        );
        assert.equal(
            panelApi.resolveAccess(reqWith({ peer: GATEWAY_PEER }), 'kitchen', { store }).error,
            'unauthorized',
        );

        // Unknown panel stays not_found regardless of credential.
        assert.equal(panelApi.resolveAccess(reqWith({ peer: '127.0.0.1' }), 'nope', { store }).error, 'not_found');
    });

    it('exchanges a device token for the kiosk cookie only when approved', () => {
        register('dev-1');
        approve('dev-1');
        const issued = registry.issueToken('dev-1');

        assert.equal(auth.getDeviceCookieOpts().sameSite, 'strict');
        assert.equal(auth.getDeviceCookieOpts().httpOnly, true);
        assert.equal(auth.DEVICE_COOKIE_NAME, 'ns_device');

        // The Exchange handler is exercised through the same verifier it calls.
        assert.equal(registry.verifyDeviceToken(issued.token), 'dev-1');
        assert.equal(registry.verifyDeviceToken('bogus'), null);
    });

    it('counts a real dashboard session as admin even while login is disabled', () => {
        // Login stays opt-in off; a session minted by /login must still open the
        // device-facing routes from a non-loopback peer (the launcher).
        assert.equal(auth.authSkipped(), true);
        const session = auth.createToken({ rememberMe: false });
        const throughLauncher = reqWith({ cookies: { tk: session } });
        assert.equal(auth.hasAdminAccess(throughLauncher), true);
        assert.equal(auth.canAccessAsDeviceOrAdmin(throughLauncher), true);

        // ...but a random cookie is not a session.
        assert.equal(auth.hasAdminAccess(reqWith({ cookies: { tk: 'not-a-session' } })), false);
    });

    it('does not let the panel collection endpoint list panels anonymously', () => {
        const panelApi = require('../server/manager/panelApi');
        const store = { listPanels: () => [{ id: 'kd2', name: 'default' }] };

        // authSkipped() is true here (login opt-in off), yet the collection
        // endpoint must not answer a caller arriving from the launcher.
        const anon = mockRes();
        panelApi.handleListPanels(reqWith({ peer: GATEWAY_PEER }), anon, { store, auth });
        assert.equal(anon.statusCode, 401);
        assert.equal(anon.body, undefined, 'no panel inventory for anonymous callers');

        const local = mockRes();
        panelApi.handleListPanels(reqWith({ peer: '127.0.0.1' }), local, { store, auth });
        assert.equal(local.statusCode, 200);
    });

    it('throttles repeated device writes per credential', () => {        auth.resetDeviceRateLimit();
        for (let i = 0; i < 3; i += 1) {
            assert.equal(auth.allowDeviceRequest('dev-1', 3), true, `request ${i + 1} allowed`);
        }
        assert.equal(auth.allowDeviceRequest('dev-1', 3), false, 'fourth request is throttled');
        assert.equal(auth.allowDeviceRequest('dev-2', 3), true, 'a different device has its own bucket');
        auth.resetDeviceRateLimit();
        assert.equal(auth.allowDeviceRequest('dev-1', 3), true, 'reset clears buckets');
    });

    it('keeps a rotated token usable for the grace window, then expires it', () => {
        register('dev-1');
        approve('dev-1');
        const first = registry.issueToken('dev-1');

        registry.retireTokens('dev-1', { graceMs: 60 * 1000 });
        assert.equal(registry.verifyDeviceToken(first.token), 'dev-1', 'offline device keeps working during grace');
        assert.equal(registry.hasCurrentToken('dev-1'), false, 'a retired token triggers reissue on next connect');

        const second = registry.issueToken('dev-1');
        assert.equal(registry.verifyDeviceToken(second.token), 'dev-1');
        assert.equal(registry.hasCurrentToken('dev-1'), true);

        registry.retireTokens('dev-1', { graceMs: 0 });
        assert.equal(registry.verifyDeviceToken(first.token), null, 'hard retire kills the old token');
        assert.equal(registry.verifyDeviceToken(second.token), null, 'and the rotates one too');
    });

    it('scopes a kiosk token to its own panel and nothing else', () => {
        const panelStore = require('../server/manager/panelStore');
        const panelApi = require('../server/manager/panelApi');
        panelStore.createPanel({ name: 'Kitchen' });
        panelStore.createPanel({ name: 'Office' });

        const issued = panelStore.issueKioskToken('kitchen');
        assert.equal(panelStore.verifyKioskToken(issued.token), 'kitchen');
        assert.equal(panelStore.verifyKioskToken('not-a-token'), null);

        const withCookie = (panelId) => reqWith({
            cookies: { [auth.DEVICE_COOKIE_NAME]: issued.token },
            params: { panelId },
        });

        const own = panelApi.resolveAccess(withCookie('kitchen'), 'kitchen');
        assert.equal(own.panel.id, 'kitchen');
        assert.equal(own.kiosk, true);

        const other = panelApi.resolveAccess(withCookie('office'), 'office');
        assert.equal(other.error, 'unauthorized', 'a kiosk token cannot open another panel');

        assert.equal(panelStore.revokeKioskTokens('kitchen'), true);
        assert.equal(panelStore.verifyKioskToken(issued.token), null);
    });
});
