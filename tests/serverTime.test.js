'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const serverTime = require('../server/manager/serverTime');

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

describe('serverTime', () => {
    it('serves the central clock to sessions', () => {
        const res = mockRes();
        serverTime.handleGetServerTime(
            {},
            res,
            { auth: adminAuth, clock: { now: () => 1234567890 } }
        );
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { now: 1234567890 });
    });

    it('uses the real clock by default', () => {
        const before = Date.now();
        const res = mockRes();
        serverTime.handleGetServerTime({}, res, { auth: adminAuth });
        assert.equal(res.statusCode, 200);
        assert.equal(typeof res.body.now, 'number');
        assert.ok(res.body.now >= before && res.body.now <= Date.now());
    });

    it('rejects anonymous callers without leaking the time', () => {
        const res = mockRes();
        serverTime.handleGetServerTime({}, res, { auth: noSessionAuth });
        assert.equal(res.statusCode, 401);
        assert.equal(res.body, undefined);
    });
});
