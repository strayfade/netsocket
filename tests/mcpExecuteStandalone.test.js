'use strict'

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

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

    it('lists node summaries with optional category filter', () => {
        const { listNodeSummaries, canAccessMcp } = require('../server/mcp/mount')
        const all = listNodeSummaries()
        const math = listNodeSummaries('Math')

        assert.ok(all.length > 0)
        assert.ok(math.every((node) => node.category === 'Math'))
        assert.ok(math.some((node) => node.nodeType === 'Math/Add'))
        assert.equal(canAccessMcp({ socket: { remoteAddress: '127.0.0.1' } }), true)
        assert.equal(canAccessMcp({ socket: { remoteAddress: '203.0.113.10' } }), false)
    })
})
