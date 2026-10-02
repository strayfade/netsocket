'use strict'

/**
 * Pure graph-layout operations over a netsocket graph root.
 *
 * A graph root is `{ nodes: <LiteGraph serialize>, currentValues: [] }`.
 * The LiteGraph object is `{ last_node_id, last_link_id, nodes, links, groups, ... }`.
 *
 * Observed on-disk reality (data/state.json):
 * - node ids and link ids are UUID strings (`last_node_id`/`last_link_id` stay 0)
 * - node `size` may be an array `[w,h]` or a `{0:w,1:h}` object (JSON round-trip)
 * - input entries: `{name, type, link: <linkId|null>}`, output entries:
 *   `{name, type, links: [<linkId>], slot_index}`
 * - link entries: `[id, origin_id, origin_slot, target_id, target_slot, type]`
 *   where type is a port-type string or -1 for event links
 * - group entries: `{title, bounding: [x,y,w,h], color, font_size}` (no id)
 *
 * Every function here mutates the root passed in. Callers that need atomicity
 * should operate on `cloneRoot(root)` and only commit on success
 * (see `applyOps`). Functions throw `Error` with a `code` property on failure.
 */

const crypto = require('crypto')

const LINK = { ID: 0, ORIGIN_ID: 1, ORIGIN_SLOT: 2, TARGET_ID: 3, TARGET_SLOT: 4, TYPE: 5 }
const EVENT_TYPE = -1
const MAX_APPLY_OPS = 50

const cloneRoot = (root) => JSON.parse(JSON.stringify(root))

const getInner = (root) => {
    const inner = root && typeof root === 'object' ? root.nodes : null
    if (!inner || typeof inner !== 'object' || !Array.isArray(inner.nodes) || !Array.isArray(inner.links)) {
        const error = new Error('Invalid graph shape: expected { nodes: { nodes: [], links: [] } }')
        error.code = 'INVALID_GRAPH'
        throw error
    }
    if (!Array.isArray(inner.groups)) inner.groups = []
    return inner
}

const fail = (code, message, extra) => {
    const error = new Error(message)
    error.code = code
    if (extra && typeof extra === 'object') Object.assign(error, extra)
    throw error
}

const sizeWH = (size, fallbackW = 180, fallbackH = 60) => {
    if (Array.isArray(size)) {
        return [Number(size[0]) || fallbackW, Number(size[1]) || fallbackH]
    }
    if (size && typeof size === 'object') {
        const w = Number(size[0] ?? size['0'] ?? size.w ?? size.width)
        const h = Number(size[1] ?? size['1'] ?? size.h ?? size.height)
        return [w || fallbackW, h || fallbackH]
    }
    return [fallbackW, fallbackH]
}

const asPos = (pos, fallback = [80, 80]) => {
    if (Array.isArray(pos) && pos.length >= 2 && Number.isFinite(Number(pos[0])) && Number.isFinite(Number(pos[1]))) {
        return [Number(pos[0]), Number(pos[1])]
    }
    return [...fallback]
}

const findNode = (inner, id) => inner.nodes.find((node) => node && node.id === id) ?? null

const isEventPortType = (type) => type === EVENT_TYPE || type === 'event' || type === 'Event'

/** Decide the stored link type for an output->input pair, or throw on mismatch. */
const resolveLinkType = (outType, inType) => {
    const outEv = isEventPortType(outType)
    const inEv = isEventPortType(inType)
    if (outEv !== inEv) {
        fail(
            'TYPE_MISMATCH',
            `Cannot link ${outEv ? 'event' : 'data'} output (type ${JSON.stringify(outType)}) to ${inEv ? 'event' : 'data'} input (type ${JSON.stringify(inType)})`,
            { outType, inType }
        )
    }
    if (outEv) return EVENT_TYPE
    if (outType === '*') return inType
    if (inType === '*') return outType
    if (outType === inType) return outType
    fail(
        'TYPE_MISMATCH',
        `Type mismatch: output is ${JSON.stringify(outType)} but input is ${JSON.stringify(inType)}. Route through a converter node, or use a Reroute (type "*") which adapts to either side.`,
        { outType, inType }
    )
}

const resolveSlotIndex = (ports, ref, kind, nodeId) => {
    if (!Array.isArray(ports)) {
        fail('NO_PORTS', `Node ${nodeId} has no ${kind} ports`)
    }
    if (typeof ref === 'number') {
        if (!Number.isInteger(ref) || ref < 0 || ref >= ports.length) {
            fail('UNKNOWN_SLOT', `Node ${nodeId} has no ${kind} slot index ${ref} (${ports.length} ${kind} ports)`)
        }
        return ref
    }
    const name = String(ref ?? '')
    const idx = ports.findIndex((port) => port && port.name === name)
    if (idx < 0) {
        const names = ports.map((port) => port && port.name).filter((n) => n !== undefined)
        fail('UNKNOWN_SLOT', `Node ${nodeId} has no ${kind} port named ${JSON.stringify(name)}. Available ${kind} ports: ${names.map((n) => JSON.stringify(n)).join(', ') || '(none)'}`, { available: names })
    }
    return idx
}

const summarizeNode = (node) => ({
    id: node.id,
    type: node.type,
    pos: Array.isArray(node.pos) ? [node.pos[0], node.pos[1]] : node.pos,
    size: sizeWH(node.size),
    mode: node.mode,
    properties: node.properties || {},
    inputs: (Array.isArray(node.inputs) ? node.inputs : []).map((port) => ({
        name: port && port.name,
        type: port && port.type,
        link: (port && port.link) ?? null,
    })),
    outputs: (Array.isArray(node.outputs) ? node.outputs : []).map((port, idx) => ({
        name: port && port.name,
        type: port && port.type,
        slot_index: (port && port.slot_index) ?? idx,
        links: Array.isArray(port && port.links) ? [...port.links] : [],
    })),
})

const readGraph = (root, options = {}) => {
    const inner = getInner(root)
    const { nodeTypes, query, ids, limit = 200, offset = 0 } = options || {}

    let nodes = inner.nodes.filter(Boolean)
    const totalNodes = nodes.length

    if (Array.isArray(ids) && ids.length) {
        const wanted = new Set(ids)
        nodes = nodes.filter((node) => wanted.has(node.id))
    }
    if (Array.isArray(nodeTypes) && nodeTypes.length) {
        const wanted = new Set(nodeTypes)
        nodes = nodes.filter((node) => wanted.has(node.type))
    }
    if (query != null && String(query).trim() !== '') {
        const q = String(query).trim().toLowerCase()
        nodes = nodes.filter((node) => String(node.type || '').toLowerCase().includes(q))
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000)
    const safeOffset = Math.max(Number(offset) || 0, 0)
    const page = nodes.slice(safeOffset, safeOffset + safeLimit)
    const visibleIds = new Set(page.map((node) => node.id))
    const filtering = (Array.isArray(ids) && ids.length) || (Array.isArray(nodeTypes) && nodeTypes.length) || (query != null && String(query).trim() !== '')

    const allLinks = inner.links.filter(Array.isArray)
    const links = (filtering ? allLinks.filter((link) => visibleIds.has(link[LINK.ORIGIN_ID]) && visibleIds.has(link[LINK.TARGET_ID])) : allLinks).slice(0, 1000)

    return {
        nodes: page.map(summarizeNode),
        links,
        groups: inner.groups.map((group, index) => ({ index, ...(group || {}) })),
        counts: { nodes: totalNodes, links: allLinks.length, groups: inner.groups.length },
        truncated: totalNodes > safeOffset + page.length || allLinks.length > links.length,
        offset: safeOffset,
        limit: safeLimit,
    }
}

/** Build serialized port entries + default properties from a node schema. */
const buildPortsFromSchema = (schema) => {
    const inputs = (schema.inputs || []).map((input) => ({ name: input.name, type: input.type, link: null }))
    const outputs = (schema.outputs || []).map((output, idx) => ({
        name: output.name,
        type: output.type,
        links: [],
        slot_index: output.index ?? idx,
    }))
    const properties = {}
    for (const input of schema.inputs || []) {
        if (input.isEvent) continue
        if (input.defaultValue !== undefined) properties[input.name] = input.defaultValue
    }
    for (const property of schema.properties || []) {
        if (!Object.prototype.hasOwnProperty.call(properties, property.name)) {
            properties[property.name] = property.defaultValue
        }
    }
    return { inputs, outputs, properties }
}

const DEFAULT_NODE_SIZE = [180, 60]
const REROUTE_SIZE = [24, 24]

const addNode = (root, args, schema) => {
    const inner = getInner(root)
    const { nodeType, pos, properties = {}, size, mode } = args || {}
    if (!nodeType || typeof nodeType !== 'string') {
        fail('INVALID_ARGS', 'add requires nodeType (e.g. "Math/Add")')
    }
    if (!schema) {
        fail('UNKNOWN_NODE', `Unknown node type: ${nodeType}. Call list_nodes to see available types.`, { nodeType })
    }
    if (properties != null && (typeof properties !== 'object' || Array.isArray(properties))) {
        fail('INVALID_ARGS', 'properties must be an object keyed by property name')
    }
    // Callers may supply their own unique id (used to wire a node within the
    // same apply_graph_edits batch); otherwise a UUID is generated.
    let id = crypto.randomUUID()
    if (args.id !== undefined) {
        if (typeof args.id !== 'string' || !args.id.length) {
            fail('INVALID_ARGS', 'add id must be a non-empty string')
        }
        if (findNode(inner, args.id)) {
            fail('DUPLICATE_ID', `A node with id ${JSON.stringify(args.id)} already exists`, { id: args.id })
        }
        id = args.id
    }
    const { inputs, outputs, properties: defaults } = buildPortsFromSchema(schema)
    const isReroute = nodeType === 'Reroute'
    const [dw, dh] = isReroute ? REROUTE_SIZE : DEFAULT_NODE_SIZE
    const [sw, sh] = size != null ? sizeWH(size, dw, dh) : [dw, dh]

    const node = {
        id,
        type: nodeType,
        pos: asPos(pos),
        size: [sw, sh],
        flags: {},
        order: inner.nodes.length,
        mode: typeof mode === 'number' ? mode : 0,
        inputs,
        outputs,
        properties: { ...defaults, ...(properties || {}) },
    }
    inner.nodes.push(node)
    return { node: summarizeNode(node) }
}

const updateNode = (root, args, schema) => {
    const inner = getInner(root)
    const { id, pos, size, properties, mode } = args || {}
    const node = findNode(inner, id)
    if (!node) {
        fail('UNKNOWN_NODE_ID', `No node with id ${JSON.stringify(id)}. Call get_graph to list ids.`, { id })
    }
    if (pos !== undefined) node.pos = asPos(pos, node.pos)
    if (size !== undefined) {
        const [w, h] = sizeWH(size)
        node.size = [w, h]
    }
    if (mode !== undefined) {
        if (typeof mode !== 'number') fail('INVALID_ARGS', 'mode must be a number')
        node.mode = mode
    }
    let unknownProperties = []
    if (properties !== undefined) {
        if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
            fail('INVALID_ARGS', 'properties must be an object keyed by property name')
        }
        node.properties = node.properties || {}
        const known = new Set([
            ...((schema && schema.inputs) || []).map((input) => input.name),
            ...((schema && schema.properties) || []).map((property) => property.name),
        ])
        for (const [key, value] of Object.entries(properties)) {
            node.properties[key] = value
            if (schema && !known.has(key)) unknownProperties.push(key)
        }
    }
    const result = { node: summarizeNode(node) }
    if (unknownProperties.length) result.unknownProperties = unknownProperties
    return result
}

const dropLinkFromEndpoints = (inner, link) => {
    const origin = findNode(inner, link[LINK.ORIGIN_ID])
    const target = findNode(inner, link[LINK.TARGET_ID])
    if (origin && Array.isArray(origin.outputs)) {
        const out = origin.outputs[link[LINK.ORIGIN_SLOT]]
        if (out && Array.isArray(out.links)) {
            out.links = out.links.filter((id) => id !== link[LINK.ID])
        }
    }
    if (target && Array.isArray(target.inputs)) {
        const inp = target.inputs[link[LINK.TARGET_SLOT]]
        if (inp && inp.link === link[LINK.ID]) inp.link = null
    }
}

const removeNode = (root, id) => {
    const inner = getInner(root)
    const idx = inner.nodes.findIndex((node) => node && node.id === id)
    if (idx < 0) {
        fail('UNKNOWN_NODE_ID', `No node with id ${JSON.stringify(id)}. Call get_graph to list ids.`, { id })
    }
    const [node] = inner.nodes.splice(idx, 1)
    const incident = new Set()
    for (const port of node.inputs || []) {
        if (port && port.link != null) incident.add(port.link)
    }
    for (const port of node.outputs || []) {
        for (const linkId of (port && port.links) || []) incident.add(linkId)
    }
    const dropped = inner.links.filter((link) => Array.isArray(link) && incident.has(link[LINK.ID]))
    inner.links = inner.links.filter((link) => {
        if (!Array.isArray(link)) return false
        return !incident.has(link[LINK.ID])
    })
    // Clear the surviving endpoint's ref (the removed node's own side is gone).
    for (const link of dropped) dropLinkFromEndpoints(inner, link)
    return { removed: id, droppedLinks: [...incident] }
}

const connect = (root, args) => {
    const inner = getInner(root)
    const { originId, originSlot, targetId, targetSlot } = args || {}
    const origin = findNode(inner, originId)
    if (!origin) fail('UNKNOWN_NODE_ID', `No node with id ${JSON.stringify(originId)} (origin)`, { id: originId })
    const target = findNode(inner, targetId)
    if (!target) fail('UNKNOWN_NODE_ID', `No node with id ${JSON.stringify(targetId)} (target)`, { id: targetId })

    const outIdx = resolveSlotIndex(origin.outputs, originSlot, 'output', originId)
    const inIdx = resolveSlotIndex(target.inputs, targetSlot, 'input', targetId)
    const outPort = origin.outputs[outIdx]
    const inPort = target.inputs[inIdx]

    const linkType = resolveLinkType(outPort.type, inPort.type)

    let replacedLinkId = null
    if (inPort.link != null) {
        replacedLinkId = inPort.link
        const oldIdx = inner.links.findIndex((link) => Array.isArray(link) && link[LINK.ID] === replacedLinkId)
        if (oldIdx >= 0) {
            dropLinkFromEndpoints(inner, inner.links[oldIdx])
            inner.links.splice(oldIdx, 1)
        }
        inPort.link = null
    }

    const linkId = crypto.randomUUID()
    const link = [linkId, originId, outIdx, targetId, inIdx, linkType]
    inner.links.push(link)
    outPort.links = Array.isArray(outPort.links) ? [...outPort.links, linkId] : [linkId]
    inPort.link = linkId

    return { link, replacedLinkId }
}

const disconnect = (root, linkId) => {
    const inner = getInner(root)
    const idx = inner.links.findIndex((link) => Array.isArray(link) && link[LINK.ID] === linkId)
    if (idx < 0) {
        fail('UNKNOWN_LINK_ID', `No link with id ${JSON.stringify(linkId)}. Call get_graph to list links.`, { linkId })
    }
    const [link] = inner.links.splice(idx, 1)
    dropLinkFromEndpoints(inner, link)
    return { removed: linkId }
}

const ALIGN_AXES = ['left', 'right', 'top', 'bottom', 'center-x', 'center-y']

const alignNodes = (root, args) => {
    const inner = getInner(root)
    const { ids, axis } = args || {}
    if (!ALIGN_AXES.includes(axis)) {
        fail('INVALID_ARGS', `axis must be one of ${ALIGN_AXES.join(', ')}`)
    }
    if (!Array.isArray(ids) || ids.length < 2) {
        fail('INVALID_ARGS', 'align requires ids with at least 2 node ids')
    }
    const nodes = ids.map((id) => {
        const node = findNode(inner, id)
        if (!node) fail('UNKNOWN_NODE_ID', `No node with id ${JSON.stringify(id)}. Call get_graph to list ids.`, { id })
        return node
    })
    const boxes = nodes.map((node) => {
        const [w, h] = sizeWH(node.size)
        return { node, x: node.pos[0], y: node.pos[1], w, h }
    })
    const minX = Math.min(...boxes.map((b) => b.x))
    const maxR = Math.max(...boxes.map((b) => b.x + b.w))
    const minY = Math.min(...boxes.map((b) => b.y))
    const maxB = Math.max(...boxes.map((b) => b.y + b.h))

    for (const box of boxes) {
        switch (axis) {
            case 'left': box.node.pos[0] = minX; break
            case 'right': box.node.pos[0] = maxR - box.w; break
            case 'top': box.node.pos[1] = minY; break
            case 'bottom': box.node.pos[1] = maxB - box.h; break
            case 'center-x': box.node.pos[0] = Math.round((minX + maxR) / 2 - box.w / 2); break
            case 'center-y': box.node.pos[1] = Math.round((minY + maxB) / 2 - box.h / 2); break
        }
    }
    return { axis, moved: boxes.map((box) => ({ id: box.node.id, pos: [...box.node.pos] })) }
}

const readGroupBounding = (group) => {
    if (Array.isArray(group.bounding) && group.bounding.length >= 4) {
        return group.bounding.map(Number)
    }
    return [10, 10, 140, 80]
}

const addGroup = (root, args) => {
    const inner = getInner(root)
    const { title = 'Group', pos = [10, 10], size = [280, 160], color } = args || {}
    const [x, y] = asPos(pos, [10, 10])
    const [w, h] = sizeWH(size, 280, 160)
    const group = {
        title: String(title),
        bounding: [x, y, Math.max(140, w), Math.max(80, h)],
        color: color != null ? String(color) : '#AAA',
        font_size: 24,
    }
    inner.groups.push(group)
    return { group: { index: inner.groups.length - 1, ...group } }
}

const updateGroup = (root, args) => {
    const inner = getInner(root)
    const { groupIndex, title, pos, size, color } = args || {}
    const group = inner.groups[groupIndex]
    if (!group) {
        fail('UNKNOWN_GROUP', `No group at index ${JSON.stringify(groupIndex)}. Call get_graph to list groups.`, { groupIndex })
    }
    if (title !== undefined) group.title = String(title)
    const [x, y, w, h] = readGroupBounding(group)
    if (pos !== undefined) {
        const [nx, ny] = asPos(pos, [x, y])
        group.bounding = [nx, ny, w, h]
    }
    if (size !== undefined) {
        const [nw, nh] = sizeWH(size, w, h)
        const [bx, by] = [group.bounding[0], group.bounding[1]]
        group.bounding = [bx, by, Math.max(140, nw), Math.max(80, nh)]
    }
    if (color !== undefined) group.color = String(color)
    return { group: { index: groupIndex, ...group } }
}

const removeGroup = (root, groupIndex) => {
    const inner = getInner(root)
    if (!Number.isInteger(groupIndex) || groupIndex < 0 || groupIndex >= inner.groups.length) {
        fail('UNKNOWN_GROUP', `No group at index ${JSON.stringify(groupIndex)}. Call get_graph to list groups.`, { groupIndex })
    }
    const [group] = inner.groups.splice(groupIndex, 1)
    return { removed: groupIndex, title: group && group.title }
}

const OP_NAMES = ['add', 'update', 'remove', 'connect', 'disconnect', 'align', 'add_group', 'update_group', 'remove_group']

/**
 * Apply a batch of ops atomically to a clone. Returns `{ root, results }`.
 * `schemaFor(nodeType)` is called for `add` ops to build ports/defaults.
 */
const applyOps = (root, ops, schemaFor) => {
    if (!Array.isArray(ops) || ops.length === 0) {
        fail('INVALID_ARGS', 'ops must be a non-empty array')
    }
    if (ops.length > MAX_APPLY_OPS) {
        fail('INVALID_ARGS', `ops is limited to ${MAX_APPLY_OPS} entries per call`)
    }
    const next = cloneRoot(root)
    const results = []
    for (let idx = 0; idx < ops.length; idx++) {
        const op = ops[idx] || {}
        try {
            switch (op.op) {
                case 'add': {
                    const schema = typeof schemaFor === 'function' ? schemaFor(op.nodeType) : null
                    results.push({ op: 'add', ...addNode(next, op, schema) })
                    break
                }
                case 'update': {
                    const node = findNode(getInner(next), op.id)
                    const schema = node && typeof schemaFor === 'function' ? schemaFor(node.type) : null
                    results.push({ op: 'update', ...updateNode(next, op, schema) })
                    break
                }
                case 'remove':
                    results.push({ op: 'remove', ...removeNode(next, op.id) })
                    break
                case 'connect':
                    results.push({ op: 'connect', ...connect(next, op) })
                    break
                case 'disconnect':
                    results.push({ op: 'disconnect', ...disconnect(next, op.linkId) })
                    break
                case 'align':
                    results.push({ op: 'align', ...alignNodes(next, op) })
                    break
                case 'add_group':
                    results.push({ op: 'add_group', ...addGroup(next, op) })
                    break
                case 'update_group':
                    results.push({ op: 'update_group', ...updateGroup(next, op) })
                    break
                case 'remove_group':
                    results.push({ op: 'remove_group', ...removeGroup(next, op.groupIndex) })
                    break
                default:
                    fail('INVALID_ARGS', `ops[${idx}].op must be one of ${OP_NAMES.join(', ')}`)
            }
        } catch (error) {
            error.opIndex = idx
            error.op = op.op
            throw error
        }
    }
    return { root: next, results }
}

module.exports = {
    LINK,
    EVENT_TYPE,
    MAX_APPLY_OPS,
    OP_NAMES,
    ALIGN_AXES,
    cloneRoot,
    getInner,
    sizeWH,
    readGraph,
    summarizeNode,
    addNode,
    updateNode,
    removeNode,
    connect,
    disconnect,
    alignNodes,
    addGroup,
    updateGroup,
    removeGroup,
    applyOps,
    resolveLinkType,
}
