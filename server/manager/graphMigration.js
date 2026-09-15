/**
 * Graph migration: Array/Object -> JSON type unification.
 * Handles persisted graphs (data/state.json) and subgraph definitions.
 */

const LEGACY_PORT_TYPES = new Set(['array', 'object'])
const LEGACY_TITLE_MAP = {
    'Constants/Array': 'Constants/JSON',
    // If Constants/Object ever had inconsistent casing, it stays JSON anyway
}

function isLegacyPortType(type) {
    if (typeof type !== 'string') return false
    return LEGACY_PORT_TYPES.has(type.trim().toLowerCase())
}

function migratePortType(type) {
    if (isLegacyPortType(type)) return 'JSON'
    return type
}

function migrateNodePorts(node) {
    if (!node || typeof node !== 'object') return false
    let changed = false

    // Migrate legacy title Constants/Array -> Constants/JSON
    if (typeof node.type === 'string' && LEGACY_TITLE_MAP[node.type]) {
        node.type = LEGACY_TITLE_MAP[node.type]
        changed = true
    }

    for (const port of node.inputs || []) {
        if (port && isLegacyPortType(port.type)) {
            port.type = 'JSON'
            changed = true
        }
    }
    for (const port of node.outputs || []) {
        if (port && isLegacyPortType(port.type)) {
            port.type = 'JSON'
            changed = true
        }
    }

    // Properties: ensure JSON defaults remain valid (no forced rewrite; keep [] or {} as-is)
    // But if property name is "Array" with "{}" default, keep as is - both are valid JSON strings.

    return changed
}

function migrateLinks(links) {
    if (!links) return false
    let changed = false

    // LiteGraph serializes links as either object map {id: linkTuple} or array of tuples
    // Link tuple format: [id, origin_id, origin_slot, target_id, target_slot, type]
    const handleLinkEntry = (link) => {
        if (!link) return
        // Object style link entry with .type
        if (!Array.isArray(link) && typeof link === 'object') {
            if (isLegacyPortType(link.type)) {
                link.type = 'JSON'
                changed = true
            }
            return
        }
        if (Array.isArray(link) && link.length >= 6) {
            const type = link[5]
            if (isLegacyPortType(type)) {
                link[5] = 'JSON'
                changed = true
            }
        }
    }

    if (Array.isArray(links)) {
        for (const link of links) handleLinkEntry(link)
    } else if (typeof links === 'object') {
        for (const key of Object.keys(links)) handleLinkEntry(links[key])
    }

    return changed
}

function migrateLiteGraphSerialize(serialized) {
    if (!serialized || typeof serialized !== 'object') return false
    let changed = false
    if (Array.isArray(serialized.nodes)) {
        for (const node of serialized.nodes) {
            if (migrateNodePorts(node)) changed = true
        }
    }
    if (serialized.links != null) {
        if (migrateLinks(serialized.links)) changed = true
    }
    // Config extra: no types
    return changed
}

function migrateGraphRoot(raw) {
    if (raw == null || typeof raw !== 'object') return false
    let changed = false

    // Case 1: direct LiteGraph serialize { nodes: [], links: [], ... }
    if (Array.isArray(raw.nodes)) {
        if (migrateLiteGraphSerialize(raw)) changed = true
        return changed
    }

    // Case 2: wrapped { nodes: { ...LiteGraph }, currentValues: [] }
    if (raw.nodes && typeof raw.nodes === 'object') {
        if (migrateLiteGraphSerialize(raw.nodes)) changed = true
        // currentValues: no types to migrate
        return changed
    }

    return changed
}

function migrateSubgraphDefinitions(payload) {
    if (!payload || typeof payload !== 'object') return false
    let changed = false
    const defs = Array.isArray(payload.definitions) ? payload.definitions : null
    if (!defs) return false
    for (const def of defs) {
        if (!def) continue
        // Inputs/outputs signatures stored as arrays of { name, type } or {name, type}?
        for (const inp of def.inputs || []) {
            if (inp && isLegacyPortType(inp.type)) {
                inp.type = 'JSON'
                changed = true
            }
        }
        for (const out of def.outputs || []) {
            if (out && isLegacyPortType(out.type)) {
                out.type = 'JSON'
                changed = true
            }
        }
        for (const out of def.eventOutputs || []) {
            // eventOutputs are strings (names), no type
        }
        if (def.graph && typeof def.graph === 'object') {
            if (migrateLiteGraphSerialize(def.graph)) changed = true
        }
    }
    return changed
}

module.exports = {
    isLegacyPortType,
    migratePortType,
    migrateNodePorts,
    migrateLinks,
    migrateLiteGraphSerialize,
    migrateGraphRoot,
    migrateSubgraphDefinitions,
    LEGACY_TITLE_MAP,
}
