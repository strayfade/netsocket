'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ntp = require('../server/utils/ntpClient');

describe('ntpClient', () => {
    it('converts NTP seconds/fraction to Unix milliseconds', () => {
        // 2020-01-01T00:00:00.000Z
        const unixMs = Date.UTC(2020, 0, 1);
        const seconds = Math.floor(unixMs / 1000) + ntp.NTP_UNIX_DELTA;
        assert.equal(ntp.ntpSecondsToUnixMs(seconds, 0), unixMs);
        // Half a second fraction ≈ 500ms
        const half = Math.floor(0.5 * 0x100000000);
        assert.equal(ntp.ntpSecondsToUnixMs(seconds, half), unixMs + 500);
    });

    it('returns the first successful host response', async () => {
        let calls = 0;
        const value = await ntp.queryNtp({
            hosts: ['fail.example', 'ok.example'],
            send: async (host) => {
                calls += 1;
                if (host === 'fail.example') throw new Error('boom');
                return 1_700_000_000_000;
            },
        });
        assert.equal(value, 1_700_000_000_000);
        assert.equal(calls, 2);
    });

    it('surfaces the last error when every host fails', async () => {
        await assert.rejects(
            () => ntp.queryNtp({
                hosts: ['a', 'b'],
                send: async () => { throw new Error('ntp_down'); },
            }),
            /ntp_down/
        );
    });
});
