'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
    parseWindowsNetstatListeningPids,
    parseUnixLsofPids,
    parseSsListeningPids,
} = require('../server/utils/killProcessOnPort')

describe('killProcessOnPort', () => {
    describe('parseWindowsNetstatListeningPids', () => {
        it('collects listening PIDs for the requested port', () => {
            const output = [
                '  TCP    0.0.0.0:4675           0.0.0.0:0              LISTENING       12345',
                '  TCP    [::]:4675              [::]:0                 LISTENING       12345',
                '  TCP    127.0.0.1:9229         0.0.0.0:0              LISTENING       99999',
                '  TCP    0.0.0.0:4675           0.0.0.0:0              ESTABLISHED     22222',
            ].join('\n')

            assert.deepEqual(parseWindowsNetstatListeningPids(output, 4675), [12345])
        })
    })

    describe('parseUnixLsofPids', () => {
        it('parses one pid per line', () => {
            assert.deepEqual(parseUnixLsofPids('12345\n67890\n'), [12345, 67890])
        })
    })

    describe('parseSsListeningPids', () => {
        it('extracts pid values from ss output', () => {
            const output = 'LISTEN 0 511 *:4675 *:* users:(("node",pid=12345,fd=21))'
            assert.deepEqual(parseSsListeningPids(output), [12345])
        })
    })
})
