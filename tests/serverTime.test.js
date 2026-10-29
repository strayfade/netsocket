'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
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
    beforeEach(() => {
        serverTime.resetForTests();
    });

    afterEach(() => {
        serverTime.resetForTests();
    });

    it('serves NTP-backed time to sessions with Eastern timezone metadata', async () => {
        const res = mockRes();
        await serverTime.handleGetServerTime(
            {},
            res,
            {
                auth: adminAuth,
                queryNtp: async () => 1_700_000_000_000,
                clock: { now: () => 1_700_000_000_050 },
                hrtime: { bigint: () => 0n },
            }
        );
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.now, 1_700_000_000_000);
        assert.equal(res.body.source, 'ntp');
        assert.equal(res.body.timeZone, 'America/New_York');
        assert.equal(res.body.syncedAt, 1_700_000_000_050);
    });

    it('advances from the NTP sample with a monotonic clock', async () => {
        let mono = 0n;
        await serverTime.syncFromNtp({
            queryNtp: async () => 5_000,
            hrtime: { bigint: () => mono },
            clock: { now: () => 100 },
        });
        mono = 2_000_000_000n; // +2 seconds
        assert.equal(serverTime.getNtpNow({ hrtime: { bigint: () => mono } }), 7_000);
    });

    it('falls back once when NTP fails on first sync', async () => {
        const now = await serverTime.syncFromNtp({
            queryNtp: async () => { throw new Error('ntp_timeout'); },
            clock: { now: () => 42 },
            hrtime: { bigint: () => 0n },
        });
        assert.equal(now, 42);
        assert.equal(serverTime.getSyncInfo().source, 'fallback');
    });

    it('rejects anonymous callers without leaking the time', async () => {
        const res = mockRes();
        await serverTime.handleGetServerTime({}, res, { auth: noSessionAuth });
        assert.equal(res.statusCode, 401);
        assert.equal(res.body, undefined);
    });
});
