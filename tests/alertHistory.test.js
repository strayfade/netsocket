'use strict';

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const {
    alert,
    getRecentAlerts,
    MAX_ALERT_HISTORY,
    setWsServerConnectedClients,
    resetAlertStateForTests,
} = require('../server/utils/alert')
const { handleDeviceRecentAlerts } = require('../server/manager/alertApi')
const deviceAuth = require('../server/utils/deviceAuth')

const makeSocket = () => ({ readyState: 1, send() {} })

describe('alert history', () => {
    beforeEach(() => {
        resetAlertStateForTests()
        setWsServerConnectedClients([makeSocket()])
    })

    it('records broadcast alerts newest-first', async () => {
        await alert('first', null, '')
        await alert('second', null, '')
        const recent = getRecentAlerts(null)
        assert.equal(recent.length, 2)
        assert.equal(recent[0].text, 'second')
        assert.equal(recent[1].text, 'first')
        assert.ok(typeof recent[0].ts === 'number')
    })

    it('shows broadcast and own device alerts only', async () => {
        await alert('for everyone', null, '')
        await alert('for g2', null, 'g2-1')
        await alert('for phone', null, 'phone-1')
        const recent = getRecentAlerts('g2-1')
        assert.deepEqual(recent.map((e) => e.text), ['for g2', 'for everyone'])
    })

    it('excludes conversation-targeted alerts', async () => {
        await alert('reply', 'conv-1', null)
        await alert('public', null, '')
        assert.deepEqual(getRecentAlerts(null).map((e) => e.text), ['public'])
    })

    it('caps history at MAX_ALERT_HISTORY', async () => {
        for (let i = 0; i < MAX_ALERT_HISTORY + 10; i++) {
            await alert(`alert ${i}`, null, '')
        }
        const recent = getRecentAlerts(null, MAX_ALERT_HISTORY + 10)
        assert.equal(recent.length, MAX_ALERT_HISTORY)
        assert.equal(recent[0].text, `alert ${MAX_ALERT_HISTORY + 9}`)
    })

    it('respects a valid limit and clamps invalid limits', async () => {
        await alert('a', null, '')
        await alert('b', null, '')
        await alert('c', null, '')
        assert.equal(getRecentAlerts(null, 2).length, 2)
        assert.equal(getRecentAlerts(null, 0).length, 1)
        assert.equal(getRecentAlerts(null, 'many').length, 3)
    })
})

describe('handleDeviceRecentAlerts', () => {
    beforeEach(() => {
        resetAlertStateForTests()
        setWsServerConnectedClients([makeSocket()])
    })

    const approvedDeps = (deviceId, sent) => ({
        deviceAuth: {
            getSession: () => ({ authenticated: true, approved: true, deviceId }),
        },
        reply: (socket, payload) => {
            sent.push(payload)
        },
    })

    it('replies with device-visible alerts for approved devices', async () => {
        await alert('hello all', null, '')
        await alert('hello g2', null, 'g2-1')
        const sent = []
        const socket = { netsocketRole: 'device' }
        const ok = handleDeviceRecentAlerts(socket, { requestId: 'r1' }, approvedDeps('g2-1', sent))
        assert.equal(ok, true)
        assert.equal(sent.length, 1)
        assert.equal(sent[0].broadcastPurpose, 'getRecentAlerts')
        assert.equal(sent[0].requestId, 'r1')
        assert.deepEqual(sent[0].broadcastData.alerts.map((e) => e.text), ['hello g2', 'hello all'])
    })

    it('silently ignores non-device roles and unapproved sessions', async () => {
        await alert('hello', null, '')
        const sent = []
        assert.equal(handleDeviceRecentAlerts({ netsocketRole: 'editor' }, {}, approvedDeps('g2-1', sent)), false)
        assert.equal(
            handleDeviceRecentAlerts(
                { netsocketRole: 'device' },
                {},
                {
                    deviceAuth: { getSession: () => ({ authenticated: true, approved: false }) },
                    reply: (socket, payload) => sent.push(payload),
                },
            ),
            false,
        )
        assert.equal(sent.length, 0)
    })

    it('allows the getRecentAlerts device purpose', () => {
        assert.equal(deviceAuth.isDevicePurposeAllowed('getRecentAlerts'), true)
        assert.equal(deviceAuth.isDevicePurposeAllowed('nope'), false)
    })
})
