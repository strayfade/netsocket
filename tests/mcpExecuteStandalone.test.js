'use strict'

const { describe, it, before, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { enableAuth, disableAuth } = require('./helpers/authMode')

describe('executeStandalone', () => {
    before(async () => {
        await require('../server/manager/nodeImporter').setupNodes(
            path.join(__dirname, '../server/nodes')
        )
    })

    it('executes Math/Add without a canvas graph', async () => {
        const { executeStandaloneNode } = require('../server/manager/executeStandalone')
        const result = await executeStandaloneNode('Math/Add', {
            inputs: { A: 2, B: 3 },
        })

        assert.equal(result.success, true)
        assert.equal(result.outputs.output_0, 5)
        assert.equal(result.outputSlots[0].value, 5)
    })

    it('returns metadata-driven defaults for String/Replace', async () => {
        const { executeStandaloneNode } = require('../server/manager/executeStandalone')
        const result = await executeStandaloneNode('String/Replace', {
            inputs: {
                Original: 'hello world',
                'Search for': 'world',
                'Replace with': 'netsocket',
            },
        })

        assert.equal(result.success, true)
        assert.match(String(result.outputs.Output), /netsocket/)
    })

    it('throws for unknown node types', async () => {
        const { executeStandaloneNode } = require('../server/manager/executeStandalone')
        await assert.rejects(
            () => executeStandaloneNode('Missing/Node', { inputs: {} }),
            /Unknown node type/
        )
    })
})

describe('node metadata', () => {
    before(async () => {
        await require('../server/manager/nodeImporter').setupNodes(
            path.join(__dirname, '../server/nodes')
        )
    })

    it('captures inputs, outputs, and descriptions', () => {
        const { getNodeMetadata } = require('../server/manager/nodeImporter')
        const schema = getNodeMetadata('Math/Add')

        assert.ok(schema)
        assert.equal(schema.category, 'Math')
        assert.equal(schema.name, 'Add')
        assert.match(schema.description, /Adds two numbers/)
        assert.deepEqual(
            schema.inputs.map((input) => input.name),
            ['A', 'B']
        )
        assert.equal(schema.outputs[0].type, 'number')
    })

    it('builds example usage from schema defaults', () => {
        const { getNodeMetadata } = require('../server/manager/nodeImporter')
        const { buildExampleUsage } = require('../server/manager/nodeSchema')
        const example = buildExampleUsage(getNodeMetadata('Math/Add'))

        assert.equal(example.nodeType, 'Math/Add')
        assert.equal(example.inputs.A, 0)
        assert.equal(example.inputs.B, 0)
    })
})

describe('MCP helpers', () => {
    before(async () => {
        await require('../server/manager/nodeImporter').setupNodes(
            path.join(__dirname, '../server/nodes')
        )
    })

    beforeEach(() => {
        // Access-control assertions below expect login to be on.
        enableAuth()
        require('../server/manager/saveUsers').setUsers([])
        require('../server/manager/settingsManager').setSetting('mcp.apiToken', 'test-mcp-token')
    })

    it('lists node summaries with optional category filter', () => {
        const { listNodeSummaries, canAccessMcp } = require('../server/mcp/mount')
        const all = listNodeSummaries()
        const math = listNodeSummaries('Math')

        assert.ok(all.length > 0)
        assert.ok(math.every((node) => node.category === 'Math'))
        assert.ok(math.some((node) => node.nodeType === 'Math/Add'))
    })

    it('requires the MCP API token in every login state', () => {
        const { canAccessMcp } = require('../server/mcp/mount')
        const { createToken } = require('../server/utils/sessionAuth')

        assert.equal(
            canAccessMcp({ headers: { authorization: 'Bearer test-mcp-token' }, cookies: {} }),
            true
        )

        // A session is no longer an alternative to the token, and login being
        // off cannot waive it.
        const sessionToken = createToken({ rememberMe: false })
        assert.equal(
            canAccessMcp({
                socket: { remoteAddress: '203.0.113.10' },
                headers: {},
                cookies: { tk: sessionToken },
            }),
            false
        )
        assert.equal(
            canAccessMcp({ socket: { remoteAddress: '203.0.113.10' }, headers: {}, cookies: {} }),
            false
        )

        disableAuth()
        assert.equal(
            canAccessMcp({ socket: { remoteAddress: '203.0.113.10' }, headers: {}, cookies: {} }),
            false
        )
        assert.equal(
            canAccessMcp({
                socket: { remoteAddress: '127.0.0.1' },
                headers: { authorization: 'Bearer test-mcp-token' },
                cookies: {},
            }),
            true
        )
    })

    it('fails closed when no MCP API token is configured', () => {
        const settingsManager = require('../server/manager/settingsManager')
        const { canAccessMcp } = require('../server/mcp/mount')
        const realSaveSettings = settingsManager.saveSettings
        settingsManager.saveSettings = async () => {}
        try {
            settingsManager.setSetting('mcp.apiToken', '')
            disableAuth()
            assert.equal(
                canAccessMcp({
                    socket: { remoteAddress: '127.0.0.1' },
                    headers: { authorization: 'Bearer whatever' },
                    cookies: {},
                }),
                false
            )
        } finally {
            settingsManager.saveSettings = realSaveSettings
        }
    })

    it('ensures the MCP API token exists when login is disabled', async () => {
        const settingsManager = require('../server/manager/settingsManager')
        const { ensureMcpApiToken } = require('../server/mcp/token')
        const realSaveSettings = settingsManager.saveSettings
        settingsManager.saveSettings = async () => {}
        try {
            settingsManager.setSetting('mcp.apiToken', '')
            disableAuth()
            const token = await ensureMcpApiToken()
            assert.ok(token)
            assert.equal(settingsManager.getSetting('mcp.apiToken'), token)
        } finally {
            settingsManager.saveSettings = realSaveSettings
        }
    })

    it('rejects LAN clients without credentials', () => {
        const { canAccessMcp } = require('../server/mcp/mount')

        assert.equal(canAccessMcp({ socket: { remoteAddress: '127.0.0.1' }, headers: {}, cookies: {} }), false)
        assert.equal(
            canAccessMcp({
                socket: { remoteAddress: '127.0.0.1' },
                headers: { authorization: 'Bearer wrong-token' },
                cookies: {},
            }),
            false
        )
    })
})
