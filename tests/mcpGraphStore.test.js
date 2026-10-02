'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const store = require('../server/mcp/graphStore')

const MATH_ADD = {
    inputs: [
        { name: 'A', type: 'number', isEvent: false, defaultValue: '0' },
        { name: 'B', type: 'number', isEvent: false, defaultValue: '0' },
    ],
    outputs: [{ index: 0, name: '', type: 'number', isEvent: false }],
    properties: [],
}

const BUTTON = {
    inputs: [],
    outputs: [{ index: 0, name: '', type: -1, isEvent: true }],
    properties: [{ name: 'Name', defaultValue: '' }],
}

const PRINT = {
    inputs: [
        { name: 'Text', type: 'string', isEvent: false, defaultValue: '' },
        { name: '', type: -1, isEvent: true },
    ],
    outputs: [{ index: 0, name: '', type: -1, isEvent: true }],
    properties: [],
}

const REROUTE = {
    inputs: [{ name: '', type: '*', isEvent: false }],
    outputs: [{ index: 0, name: '', type: '*', isEvent: false }],
    properties: [],
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

describe('graphStore', () => {
    let root
    beforeEach(() => {
        root = makeRoot()
    })

    it('adds a node with schema ports and defaults', () => {
        const { node } = store.addNode(root, { nodeType: 'Math/Add', pos: [100, 200] }, MATH_ADD)
        assert.equal(node.type, 'Math/Add')
        assert.deepEqual(node.pos, [100, 200])
        assert.deepEqual(node.size, [180, 60])
        assert.equal(node.inputs.length, 2)
        assert.equal(node.inputs[0].link, null)
        assert.deepEqual(node.properties, { A: '0', B: '0' })
        assert.equal(root.nodes.nodes.length, 1)
    })

    it('sizes Reroute nodes 24x24 and accepts caller-supplied ids', () => {
        const { node } = store.addNode(root, { nodeType: 'Reroute', id: 'r1', pos: [0, 0] }, REROUTE)
        assert.deepEqual(node.size, [24, 24])
        assert.equal(node.id, 'r1')
        assert.throws(
            () => store.addNode(root, { nodeType: 'Reroute', id: 'r1' }, REROUTE),
            /already exists/
        )
    })

    it('rejects unknown node types without a schema', () => {
        assert.throws(
            () => store.addNode(root, { nodeType: 'Missing/Node' }, null),
            /Unknown node type/
        )
    })

    it('updates position, size and properties', () => {
        const { node } = store.addNode(root, { nodeType: 'Math/Add', pos: [0, 0] }, MATH_ADD)
        const updated = store.updateNode(root, { id: node.id, pos: [10, 20], size: [200, 80], properties: { A: 5 } }, MATH_ADD)
        assert.deepEqual(updated.node.pos, [10, 20])
        assert.deepEqual(updated.node.size, [200, 80])
        assert.equal(updated.node.properties.A, 5)
        assert.deepEqual(updated.unknownProperties || [], [])
    })

    it('reports unknown property names instead of dropping them', () => {
        const { node } = store.addNode(root, { nodeType: 'Math/Add', pos: [0, 0] }, MATH_ADD)
        const updated = store.updateNode(root, { id: node.id, properties: { Nope: 1 } }, MATH_ADD)
        assert.deepEqual(updated.unknownProperties, ['Nope'])
        assert.equal(updated.node.properties.Nope, 1)
    })

    it('connects by port name and stores the link on both endpoints', () => {
        const a = store.addNode(root, { nodeType: 'Math/Add', id: 'a', pos: [0, 0] }, MATH_ADD).node
        const b = store.addNode(root, { nodeType: 'Math/Add', id: 'b', pos: [300, 0] }, MATH_ADD).node
        const { link } = store.connect(root, { originId: 'a', originSlot: '', targetId: 'b', targetSlot: 'A' })
        assert.equal(link[1], 'a')
        assert.equal(link[2], 0)
        assert.equal(link[3], 'b')
        assert.equal(link[4], 0)
        assert.equal(link[5], 'number')
        assert.equal(root.nodes.nodes[0].outputs[0].links.length, 1)
        assert.equal(root.nodes.nodes[1].inputs[0].link, link[0])
        void a
        void b
    })

    it('routes wildcards and events, rejects mismatches', () => {
        store.addNode(root, { nodeType: 'Math/Add', id: 'a', pos: [0, 0] }, MATH_ADD)
        store.addNode(root, { nodeType: 'Reroute', id: 'r', pos: [200, 0] }, REROUTE)
        const wild = store.connect(root, { originId: 'a', originSlot: 0, targetId: 'r', targetSlot: 0 })
        assert.equal(wild.link[5], 'number')

        store.addNode(root, { nodeType: 'Triggers/Button', id: 'btn', pos: [0, 200] }, BUTTON)
        store.addNode(root, { nodeType: 'Debugging/Print', id: 'prt', pos: [300, 200] }, PRINT)
        const evt = store.connect(root, { originId: 'btn', originSlot: 0, targetId: 'prt', targetSlot: '' })
        assert.equal(evt.link[5], -1)

        assert.throws(
            () => store.connect(root, { originId: 'a', originSlot: 0, targetId: 'prt', targetSlot: 'Text' }),
            /Type mismatch/
        )
        assert.throws(
            () => store.connect(root, { originId: 'btn', originSlot: 0, targetId: 'a', targetSlot: 'A' }),
            /event/
        )
    })

    it('replaces the existing link when connecting to an occupied input', () => {
        store.addNode(root, { nodeType: 'Math/Add', id: 'a', pos: [0, 0] }, MATH_ADD)
        store.addNode(root, { nodeType: 'Math/Add', id: 'b', pos: [0, 100] }, MATH_ADD)
        store.addNode(root, { nodeType: 'Math/Add', id: 'c', pos: [300, 0] }, MATH_ADD)
        const first = store.connect(root, { originId: 'a', originSlot: 0, targetId: 'c', targetSlot: 'A' })
        const second = store.connect(root, { originId: 'b', originSlot: 0, targetId: 'c', targetSlot: 'A' })
        assert.equal(second.replacedLinkId, first.link[0])
        assert.equal(root.nodes.links.length, 1)
    })

    it('removes nodes with their incident links and disconnects single links', () => {
        store.addNode(root, { nodeType: 'Math/Add', id: 'a', pos: [0, 0] }, MATH_ADD)
        store.addNode(root, { nodeType: 'Math/Add', id: 'b', pos: [300, 0] }, MATH_ADD)
        const { link } = store.connect(root, { originId: 'a', originSlot: 0, targetId: 'b', targetSlot: 'A' })
        const dropped = store.disconnect(root, link[0])
        assert.equal(dropped.removed, link[0])
        assert.equal(root.nodes.nodes[1].inputs[0].link, null)

        store.connect(root, { originId: 'a', originSlot: 0, targetId: 'b', targetSlot: 'A' })
        const removed = store.removeNode(root, 'a')
        assert.equal(removed.droppedLinks.length, 1)
        assert.equal(root.nodes.links.length, 0)
        assert.equal(root.nodes.nodes[0].inputs[0].link, null)
    })

    it('errors on unknown ids and slots with helpful hints', () => {
        store.addNode(root, { nodeType: 'Math/Add', id: 'a', pos: [0, 0] }, MATH_ADD)
        assert.throws(() => store.removeNode(root, 'nope'), /No node with id/)
        assert.throws(() => store.connect(root, { originId: 'a', originSlot: 'ZZZ', targetId: 'a', targetSlot: 'A' }), /Available output ports/)
        assert.throws(() => store.disconnect(root, 'nope'), /No link with id/)
    })

    it('aligns nodes along each axis', () => {
        store.addNode(root, { nodeType: 'Math/Add', id: 'a', pos: [0, 50], size: [100, 40] }, MATH_ADD)
        store.addNode(root, { nodeType: 'Math/Add', id: 'b', pos: [300, 200], size: [100, 40] }, MATH_ADD)
        const left = store.alignNodes(root, { ids: ['a', 'b'], axis: 'left' })
        assert.deepEqual(left.moved.map((m) => m.pos[0]), [0, 0])
        const bottom = store.alignNodes(root, { ids: ['a', 'b'], axis: 'bottom' })
        assert.deepEqual(bottom.moved.map((m) => m.pos[1]), [200, 200])
        const cx = store.alignNodes(root, { ids: ['a', 'b'], axis: 'center-x' })
        assert.equal(cx.moved[0].pos[0], cx.moved[1].pos[0])
        assert.throws(() => store.alignNodes(root, { ids: ['a'], axis: 'left' }), /at least 2/)
        assert.throws(() => store.alignNodes(root, { ids: ['a', 'b'], axis: 'diagonal' }), /axis must be/)
    })

    it('creates, updates and removes groups by index', () => {
        const added = store.addGroup(root, { title: 'Hue', pos: [0, 0], size: [300, 200], color: '#0ea5e9' })
        assert.equal(added.group.index, 0)
        assert.deepEqual(added.group.bounding, [0, 0, 300, 200])
        const updated = store.updateGroup(root, { groupIndex: 0, title: 'Lights', pos: [10, 10] })
        assert.equal(updated.group.title, 'Lights')
        assert.deepEqual(updated.group.bounding.slice(0, 2), [10, 10])
        const removed = store.removeGroup(root, 0)
        assert.equal(removed.title, 'Lights')
        assert.throws(() => store.removeGroup(root, 0), /No group at index/)
    })

    it('reads with filters and pagination', () => {
        store.addNode(root, { nodeType: 'Math/Add', id: 'a', pos: [0, 0] }, MATH_ADD)
        store.addNode(root, { nodeType: 'Math/Add', id: 'b', pos: [0, 0] }, MATH_ADD)
        store.addNode(root, { nodeType: 'Reroute', id: 'r', pos: [0, 0] }, REROUTE)
        const byType = store.readGraph(root, { nodeTypes: ['Reroute'] })
        assert.equal(byType.nodes.length, 1)
        const byQuery = store.readGraph(root, { query: 'math' })
        assert.equal(byQuery.nodes.length, 2)
        const page = store.readGraph(root, { limit: 2 })
        assert.equal(page.nodes.length, 2)
        assert.equal(page.truncated, true)
        const byIds = store.readGraph(root, { ids: ['r'] })
        assert.equal(byIds.nodes[0].id, 'r')
    })

    it('applies batches atomically: a failing op rolls everything back', () => {
        const before = JSON.stringify(root)
        assert.throws(
            () => store.applyOps(root, [
                { op: 'add', id: 'a', nodeType: 'Math/Add', pos: [0, 0] },
                { op: 'connect', originId: 'a', originSlot: 0, targetId: 'ghost', targetSlot: 0 },
            ], (type) => (type === 'Math/Add' ? MATH_ADD : null)),
            /No node with id/
        )
        assert.equal(JSON.stringify(root), before)
    })

    it('supports single-batch wiring with caller-supplied ids', () => {
        const { root: next, results } = store.applyOps(root, [
            { op: 'add', id: 'src', nodeType: 'Math/Add', pos: [0, 0] },
            { op: 'add', id: 'dst', nodeType: 'Math/Add', pos: [300, 0] },
            { op: 'connect', originId: 'src', originSlot: 0, targetId: 'dst', targetSlot: 'B' },
            { op: 'align', ids: ['src', 'dst'], axis: 'top' },
        ], (type) => (type === 'Math/Add' ? MATH_ADD : null))
        assert.equal(results.length, 4)
        assert.equal(next.nodes.links.length, 1)
        assert.equal(next.nodes.links[0][4], 1)
    })
})
