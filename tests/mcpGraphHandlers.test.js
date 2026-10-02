'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const { createGraphContext } = require('../server/mcp/graphHandlers')
const { log } = require('../server/log')

const SCHEMAS = {
    'Math/Add': {
        inputs: [
            { name: 'A', type: 'number', isEvent: false, defaultValue: '0' },
            { name: 'B', type: 'number', isEvent: false, defaultValue: '0' },
        ],
        outputs: [{ index: 0, name: '', type: 'number', isEvent: false }],
        properties: [],
    },
    'Triggers/Button': {
        inputs: [],
        outputs: [{ index: 0, name: '', type: -1, isEvent: true }],
        properties: [{ name: 'Name', defaultValue: '' }],
    },
    'Debugging/Print': {
        inputs: [
            { name: 'Text', type: 'string', isEvent: false, defaultValue: '' },
            { name: '', type: -1, isEvent: true },
        ],
        outputs: [{ index: 0, name: '', type: -1, isEvent: true }],
        properties: [],
    },
}

const makeRoot = () => ({
    nodes: {
        last_node_id: 0,
        last_link_id: 0,
        nodes: [],
        links: [],
        groups: [],
        config: {},
        extra: {},
        version: 0.4,
    },
    currentValues: [],
})

describe('graph handlers context', () => {
    let state
    let persisted
    let ctx

    beforeEach(() => {
        state = makeRoot()
        persisted = 0
        ctx = createGraphContext({
            getRoot: () => state,
            persistInner: (inner) => {
                persisted += 1
                state = { nodes: inner, currentValues: state.currentValues }
            },
            getSchema: (nodeType) => SCHEMAS[nodeType] || null,
            runNode: async (node, customInputs) => {
                log(`[test] executed ${node.type}`)
                if (customInputs && typeof customInputs === 'object') {
                    state.currentValues = { ...state.currentValues, custom: customInputs }
                }
            },
        })
    })

    it('reads an empty graph at rev 0', () => {
        const result = ctx.getGraph({})
        assert.equal(result.success, true)
        assert.equal(result.rev, 0)
        assert.deepEqual(result.counts, { nodes: 0, links: 0, groups: 0 })
    })

    it('adds, connects and aligns nodes with rev tracking', () => {
        const added = ctx.addNode({ nodeType: 'Math/Add', id: 'a', pos: [0, 0] })
        assert.equal(added.success, true)
        assert.equal(added.rev, 1)
        assert.equal(persisted, 1)

        const unknown = ctx.addNode({ nodeType: 'Missing/Node' })
        assert.equal(unknown.success, false)
        assert.equal(unknown.code, 'UNKNOWN_NODE')

        ctx.addNode({ nodeType: 'Math/Add', id: 'b', pos: [400, 100] })
        const linked = ctx.connectNodes({ originId: 'a', originSlot: 0, targetId: 'b', targetSlot: 'A' })
        assert.equal(linked.success, true)
        assert.equal(linked.link[5], 'number')

        const aligned = ctx.alignNodes({ ids: ['a', 'b'], axis: 'top' })
        assert.equal(aligned.success, true)
        assert.equal(aligned.moved[0].pos[1], aligned.moved[1].pos[1])
    })

    it('rejects stale baseRev and supports dry runs', () => {
        ctx.addNode({ nodeType: 'Math/Add', id: 'a', pos: [0, 0] })
        const stale = ctx.applyEdits({ ops: [{ op: 'remove', id: 'a' }], baseRev: 0 })
        assert.equal(stale.success, false)
        assert.equal(stale.code, 'STALE_REV')

        const dry = ctx.applyEdits({ ops: [{ op: 'remove', id: 'a' }], baseRev: 1, dryRun: true })
        assert.equal(dry.success, true)
        assert.equal(dry.committed, false)
        assert.equal(ctx.getGraph({}).counts.nodes, 1)

        const real = ctx.applyEdits({ ops: [{ op: 'remove', id: 'a' }], baseRev: 1 })
        assert.equal(real.success, true)
        assert.equal(real.committed, true)
        assert.equal(ctx.getGraph({}).counts.nodes, 0)
    })

    it('undoes and redoes committed batches', () => {
        ctx.addNode({ nodeType: 'Math/Add', id: 'a', pos: [0, 0] })
        assert.equal(ctx.getGraph({}).counts.nodes, 1)
        const undone = ctx.graphUndo({})
        assert.equal(undone.success, true)
        assert.equal(ctx.getGraph({}).counts.nodes, 0)
        const redone = ctx.graphRedo({})
        assert.equal(redone.success, true)
        assert.equal(ctx.getGraph({}).counts.nodes, 1)
        assert.equal(ctx.graphRedo({}).code, 'EMPTY')
    })

    it('executes a node by id and captures logs plus output values', async () => {
        ctx.addNode({ nodeType: 'Triggers/Button', id: 'btn', pos: [0, 0] })
        ctx.addNode({ nodeType: 'Debugging/Print', id: 'prt', pos: [300, 0] })
        ctx.connectNodes({ originId: 'btn', originSlot: 0, targetId: 'prt', targetSlot: '' })

        const missing = await ctx.executeGraphNode({ id: 'ghost' })
        assert.equal(missing.success, false)
        assert.equal(missing.code, 'UNKNOWN_NODE_ID')

        const ran = await ctx.executeGraphNode({ id: 'btn' })
        assert.equal(ran.success, true)
        assert.equal(ran.nodeType, 'Triggers/Button')
        assert.ok(ran.logLines.some((line) => line.includes('executed Triggers/Button')))
    })

    it('removes nodes and manages groups end to end', () => {
        ctx.addNode({ nodeType: 'Math/Add', id: 'a', pos: [0, 0] })
        const group = ctx.addGroup({ title: 'Math', pos: [0, 0], size: [300, 200] })
        assert.equal(group.group.index, 0)
        const renamed = ctx.updateGroup({ groupIndex: 0, title: 'Arithmetic' })
        assert.equal(renamed.group.title, 'Arithmetic')
        assert.equal(ctx.removeGroup({ groupIndex: 0 }).removed, 0)
        assert.equal(ctx.removeNode({ id: 'a' }).removed, 'a')
        assert.equal(ctx.disconnectLink({ linkId: 'ghost' }).code, 'UNKNOWN_LINK_ID')
    })
})
