'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const {
    alert,
    setWsServerConnectedClients,
    registerConversation,
    registerDevice,
    unregisterSocket,
    normalizeId,
    resetAlertStateForTests,
} = require('../server/utils/alert')

const makeClient = () => {
    const messages = []
    return {
        readyState: 1,
        messages,
        send(payload) {
            messages.push(payload)
        },
    }
}

describe('alert device routing', () => {
    beforeEach(() => {
        resetAlertStateForTests()
    })

    it('normalizes blank ids to null', () => {
        assert.equal(normalizeId(null), null)
        assert.equal(normalizeId(''), null)
        assert.equal(normalizeId('  '), null)
        assert.equal(normalizeId(' device-1 '), 'device-1')
    })

    it('broadcasts to all clients when device id is blank', async () => {
        const a = makeClient()
        const b = makeClient()
        setWsServerConnectedClients([a, b])

        await alert('hello everyone', null, '')

        assert.equal(a.messages.length, 1)
        assert.equal(b.messages.length, 1)
        const payload = JSON.parse(a.messages[0])
        assert.equal(payload.broadcastPurpose, 'overlay')
        assert.equal(payload.broadcastData.text, 'hello everyone')
        assert.equal(payload.broadcastData.deviceId, null)
    })

    it('routes to registered device sockets when device id is set', async () => {
        const target = makeClient()
        const other = makeClient()
        setWsServerConnectedClients([target, other])
        registerDevice('phone-1', target)

        await alert('for phone', null, 'phone-1')

        assert.equal(target.messages.length, 1)
        assert.equal(other.messages.length, 0)
        const payload = JSON.parse(target.messages[0])
        assert.equal(payload.broadcastData.deviceId, 'phone-1')
        assert.equal(payload.broadcastData.text, 'for phone')
    })

    it('falls back to broadcast when device has no registered sockets', async () => {
        const a = makeClient()
        const b = makeClient()
        setWsServerConnectedClients([a, b])

        await alert('fallback', null, 'missing-device')

        assert.equal(a.messages.length, 1)
        assert.equal(b.messages.length, 1)
        assert.equal(JSON.parse(a.messages[0]).broadcastData.deviceId, 'missing-device')
    })

    it('prefers conversation routing over device routing', async () => {
        const conversationClient = makeClient()
        const deviceClient = makeClient()
        setWsServerConnectedClients([conversationClient, deviceClient])
        registerConversation('conv-1', conversationClient)
        registerDevice('phone-1', deviceClient)

        await alert('reply', 'conv-1', 'phone-1')

        assert.equal(conversationClient.messages.length, 1)
        assert.equal(deviceClient.messages.length, 0)
    })

    it('clears device registration on socket unregister', async () => {
        const client = makeClient()
        setWsServerConnectedClients([client])
        registerDevice('phone-1', client)
        unregisterSocket(client)

        await alert('after unregister', null, 'phone-1')
        // No registered sockets → broadcast fallback to connected clients
        assert.equal(client.messages.length, 1)
    })
})

describe('Command Palette and Alert device pins', () => {
    it('registers Device ID pins on both nodes', async () => {
        const { setupNodes, getNodeMetadata } = require('../server/manager/nodeImporter')
        await setupNodes(path.join(__dirname, '../server/nodes'))

        const commandPalette = getNodeMetadata('Triggers/Command Palette')
        assert.ok(commandPalette)
        assert.ok(commandPalette.outputs.some((output) => output.name === 'Device ID'))

        const alertNode = getNodeMetadata('Notifiers/Alert')
        assert.ok(alertNode)
        assert.ok(alertNode.inputs.some((input) => input.name === 'Device ID'))
    })
})
