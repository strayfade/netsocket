const fs = require('fs').promises
const crypto = require('crypto')
const { config } = require('../config')
const { log, logColors } = require('../log')
const {
    registerDynamicNode,
    unregisterDynamicNode,
    listDynamicNodeTitles,
} = require('./nodeImporter')
const {
    extractSignatureFromGraph,
    createEmptySubgraphGraph,
    buildSubgraphMetadata,
    createSubgraphRunner,
    cloneGraph,
} = require('./subgraphExecute')

const SUBGRAPH_PREFIX = 'Subgraphs/'
const STORAGE_PATH = config.storage.subgraphs

let definitionsById = new Map()
let loaded = false

const titleForName = (name) => `${SUBGRAPH_PREFIX}${name}`

const sanitizeName = (name) => {
    const cleaned = String(name || '').trim().replace(/[\\/]/g, '-').replace(/\s+/g, ' ')
    return cleaned || 'Untitled'
}

const cloneDefinition = (def) => JSON.parse(JSON.stringify(def))

const getDefinition = (id) => {
    if (!id) return null
    const def = definitionsById.get(id)
    return def ? cloneDefinition(def) : null
}

const getDefinitionByName = (name) => {
    const target = sanitizeName(name)
    for (const def of definitionsById.values()) {
        if (def.name === target) {
            return cloneDefinition(def)
        }
    }
    return null
}

const listDefinitions = () => {
    return Array.from(definitionsById.values())
        .map(cloneDefinition)
        .sort((a, b) => a.name.localeCompare(b.name))
}

const persist = async () => {
    const payload = {
        version: 1,
        definitions: listDefinitions(),
    }
    await fs.writeFile(STORAGE_PATH, JSON.stringify(payload, null, 2), 'utf8')
}

const unregisterAllSubgraphTypes = () => {
    for (const title of listDynamicNodeTitles(SUBGRAPH_PREFIX)) {
        unregisterDynamicNode(title)
    }
}

const registerDefinitionType = (definition) => {
    const title = titleForName(definition.name)
    const runner = createSubgraphRunner((id) => definitionsById.get(id) || null)
    const metadata = buildSubgraphMetadata(definition)
    registerDynamicNode(title, runner, metadata)
}

const registerAllTypes = () => {
    unregisterAllSubgraphTypes()
    for (const def of definitionsById.values()) {
        registerDefinitionType(def)
    }
}

const loadSubgraphs = async () => {
    try {
        const raw = await fs.readFile(STORAGE_PATH, 'utf8')
        const parsed = JSON.parse(raw)
        const list = Array.isArray(parsed?.definitions) ? parsed.definitions : []
        definitionsById = new Map()
        for (const item of list) {
            if (!item || !item.id || !item.name) continue
            const graph = item.graph && typeof item.graph === 'object'
                ? cloneGraph(item.graph)
                : createEmptySubgraphGraph()
            const signature = extractSignatureFromGraph(graph)
            definitionsById.set(item.id, {
                id: item.id,
                name: sanitizeName(item.name),
                inputs: Array.isArray(item.inputs) ? item.inputs : signature.inputs,
                outputs: Array.isArray(item.outputs) ? item.outputs : signature.outputs,
                eventOutputs: Array.isArray(item.eventOutputs)
                    ? item.eventOutputs
                    : signature.eventOutputs,
                graph,
            })
        }
        loaded = true
        registerAllTypes()
        log(`Loaded ${definitionsById.size} subgraph definition(s)`)
    } catch (e) {
        if (e && e.code === 'ENOENT') {
            definitionsById = new Map()
            loaded = true
            registerAllTypes()
            await persist()
            log('Created empty subgraphs.json')
            return
        }
        log(`Failed to load subgraphs: ${e}`, logColors.Error)
        definitionsById = new Map()
        loaded = true
        registerAllTypes()
    }
}

const syncSignature = (definition) => {
    const signature = extractSignatureFromGraph(definition.graph)
    definition.inputs = signature.inputs
    definition.outputs = signature.outputs
    definition.eventOutputs = signature.eventOutputs
    return definition
}

const saveDefinition = async (incoming) => {
    if (!loaded) {
        await loadSubgraphs()
    }
    const id = incoming?.id || crypto.randomUUID()
    let name = sanitizeName(incoming?.name)
    const existing = definitionsById.get(id)

    // Ensure unique name among other definitions
    const nameTaken = (candidate) => {
        for (const def of definitionsById.values()) {
            if (def.id !== id && def.name === candidate) {
                return true
            }
        }
        return false
    }
    if (nameTaken(name)) {
        let suffix = 2
        while (nameTaken(`${name} ${suffix}`)) {
            suffix++
        }
        name = `${name} ${suffix}`
    }

    // Unregister old title if renamed
    if (existing && existing.name !== name) {
        unregisterDynamicNode(titleForName(existing.name))
    }

    const graph = incoming?.graph && typeof incoming.graph === 'object'
        ? cloneGraph(incoming.graph)
        : (existing ? cloneGraph(existing.graph) : createEmptySubgraphGraph())

    const definition = syncSignature({
        id,
        name,
        graph,
        inputs: [],
        outputs: [],
    })

    definitionsById.set(id, definition)
    registerDefinitionType(definition)
    await persist()
    return cloneDefinition(definition)
}

const createDefinition = async (name, graph) => {
    return saveDefinition({
        id: crypto.randomUUID(),
        name: sanitizeName(name),
        graph: graph && typeof graph === 'object' ? graph : createEmptySubgraphGraph(),
    })
}

const deleteDefinition = async (id) => {
    if (!loaded) {
        await loadSubgraphs()
    }
    const existing = definitionsById.get(id)
    if (!existing) {
        return false
    }
    unregisterDynamicNode(titleForName(existing.name))
    definitionsById.delete(id)
    await persist()
    return true
}

const isSubgraphCallType = (type) =>
    typeof type === 'string' && type.startsWith(SUBGRAPH_PREFIX)

module.exports = {
    SUBGRAPH_PREFIX,
    STORAGE_PATH,
    titleForName,
    sanitizeName,
    loadSubgraphs,
    listDefinitions,
    getDefinition,
    getDefinitionByName,
    saveDefinition,
    createDefinition,
    deleteDefinition,
    registerAllTypes,
    createEmptySubgraphGraph,
    extractSignatureFromGraph,
    isSubgraphCallType,
}
