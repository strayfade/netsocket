const crypto = require('crypto')
const {
    executeGraph,
    seedNodeOutputValue,
    resolveNodeInputValue,
    MAX_SUBGRAPH_DEPTH,
} = require('./execute')
const {
    findNodesByType,
    isEventType,
} = require('./graphUtils')

const ON_TRIGGER_TYPE = 'Subgraph/On Trigger'
const INPUT_TYPE = 'Subgraph/Input'
const OUTPUT_TYPE = 'Subgraph/Output'
const OUTPUT_TRIGGER_TYPE = 'Subgraph/Output Trigger'

const EMPTY_LITEGRAPH = {
    last_node_id: 0,
    last_link_id: 0,
    nodes: [],
    links: [],
    groups: [],
    config: {},
    extra: {},
    version: 0.4,
}

const cloneGraph = (graph) => {
    if (!graph || typeof graph !== 'object') {
        return { ...EMPTY_LITEGRAPH, nodes: [], links: [] }
    }
    return JSON.parse(JSON.stringify(graph))
}

const defaultValueForType = (type) => {
    switch (type) {
        case 'number':
            return 0
        case 'boolean':
            return 'False'
        case 'array':
            return '[]'
        case 'object':
            return '{}'
        default:
            return ''
    }
}

const normalizePortType = (type) => {
    const t = String(type || 'string').trim()
    if (['string', 'number', 'boolean', 'array', 'object', '*'].includes(t)) {
        return t
    }
    return 'string'
}

const extractSignatureFromGraph = (graph) => {
    const inputs = []
    const outputs = []
    const eventOutputs = []
    const usedEventNames = new Set()
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : []
    for (const node of nodes) {
        if (!node) continue
        if (node.type === INPUT_TYPE) {
            const name = String(node.properties?.Name || 'input').trim() || 'input'
            inputs.push({
                name,
                type: normalizePortType(node.properties?.Type),
            })
        } else if (node.type === OUTPUT_TYPE) {
            const name = String(node.properties?.Name || 'output').trim() || 'output'
            outputs.push({
                name,
                type: normalizePortType(node.properties?.Type),
            })
        } else if (node.type === OUTPUT_TRIGGER_TYPE) {
            const name = String(node.properties?.Name || 'Done').trim() || 'Done'
            if (usedEventNames.has(name)) continue
            usedEventNames.add(name)
            eventOutputs.push({ name })
        }
    }
    return { inputs, outputs, eventOutputs }
}

const createEmptySubgraphGraph = () => {
    const graph = { ...EMPTY_LITEGRAPH, nodes: [], links: [] }
    const triggerId = crypto.randomUUID()
    const outTriggerId = crypto.randomUUID()
    graph.nodes.push({
        id: triggerId,
        type: ON_TRIGGER_TYPE,
        pos: [80, 120],
        size: [180, 60],
        flags: {},
        order: 0,
        mode: 0,
        inputs: [],
        outputs: [{ name: '', type: -1, links: null }],
        properties: {},
    })
    graph.nodes.push({
        id: outTriggerId,
        type: OUTPUT_TRIGGER_TYPE,
        pos: [400, 120],
        size: [180, 60],
        flags: {},
        order: 1,
        mode: 0,
        inputs: [{ name: '', type: -1, link: null }],
        outputs: [],
        properties: { Name: 'Done' },
    })
    graph.last_node_id = 2
    return graph
}

const resolveEventOutputs = (definition) => {
    const listed = Array.isArray(definition.eventOutputs) ? definition.eventOutputs : null
    if (listed && listed.length) {
        return listed.map((item) => ({
            name: String(item?.name || 'Done').trim() || 'Done',
        }))
    }
    // Backward compatible default when older definitions have no Output Trigger nodes
    return [{ name: 'Done' }]
}

const buildSubgraphMetadata = (definition) => {
    const title = `Subgraphs/${definition.name}`
    const eventOutputs = resolveEventOutputs(definition)
    const inputs = [
        {
            name: '',
            type: 'event',
            isEvent: true,
            mcpOmit: true,
            description: 'Execution trigger for graph flows.',
            structure: 'Flow-control event port; omit from execute_node.inputs.',
            required: false,
        },
        ...(definition.inputs || []).map((input) => ({
            name: input.name,
            type: input.type === '*' ? 'string' : input.type,
            isEvent: false,
            description: `Subgraph input "${input.name}".`,
            structure: `Value of type ${input.type}.`,
            required: false,
            defaultValue: defaultValueForType(input.type),
        })),
    ]
    const outputs = [
        ...(definition.outputs || []).map((output, idx) => ({
            name: output.name,
            type: output.type === '*' ? 'string' : output.type,
            isEvent: false,
            description: `Subgraph output "${output.name}".`,
            structure: `Value of type ${output.type}.`,
            mcpKey: output.name || `output_${idx}`,
        })),
        ...eventOutputs.map((eventOut) => ({
            name: eventOut.name,
            type: 'event',
            isEvent: true,
            mcpOmit: true,
            description: `Event output "${eventOut.name}" fired by Subgraph/Output Trigger.`,
            structure: 'Flow-control event port.',
        })),
    ]
    const properties = [
        {
            name: 'subgraphId',
            type: 'string',
            defaultValue: definition.id,
        },
        ...(definition.inputs || []).map((input) => ({
            name: input.name,
            type: input.type === '*' ? 'string' : input.type,
            defaultValue: defaultValueForType(input.type),
        })),
    ]
    return {
        title,
        name: definition.name,
        description: `Calls the "${definition.name}" subgraph.`,
        category: 'Subgraphs',
        color: 'cyan',
        icon: 'account_tree',
        inputs,
        outputs,
        properties,
        mcpPreferred: false,
        subgraphId: definition.id,
        isSubgraphCall: true,
        eventOutputs,
    }
}

const createSubgraphRunner = (getDefinitionById) => {
    return async (properties, params, behaviors) => {
        const subgraphId = properties?.subgraphId
        const definition = typeof getDefinitionById === 'function'
            ? getDefinitionById(subgraphId)
            : null
        if (!definition || !definition.graph) {
            throw new Error(`Subgraph definition not found: ${subgraphId}`)
        }

        const scopedRoot = {
            nodes: cloneGraph(definition.graph),
            currentValues: [],
        }
        const parentDepth = behaviors?.__executeOptions?.depth || 0
        const eventOutputs = resolveEventOutputs(definition)
        const dataOutputs = definition.outputs || []
        const hasExplicitOutputTriggers = findNodesByType(scopedRoot, OUTPUT_TRIGGER_TYPE).length > 0

        const options = {
            graphRoot: scopedRoot,
            depth: parentDepth + 1,
            subgraphEventEmitter: async (eventName) => {
                const name = String(eventName || '').trim() || 'Done'
                const eventIdx = eventOutputs.findIndex((item) => item.name === name)
                if (eventIdx < 0) return
                const groups = behaviors.getOutputNodeGroups()
                const slotIndex = dataOutputs.length + eventIdx
                await behaviors.triggerNodeGroup(groups[slotIndex] || [])
            },
        }
        if (options.depth > MAX_SUBGRAPH_DEPTH) {
            throw new Error(`Subgraph nesting exceeded max depth (${MAX_SUBGRAPH_DEPTH})`)
        }

        const inputNodes = findNodesByType(scopedRoot, INPUT_TYPE)
        for (const inputNode of inputNodes) {
            const name = String(inputNode.properties?.Name || '').trim()
            if (!name) continue
            const value = Object.prototype.hasOwnProperty.call(params || {}, name)
                ? params[name]
                : null
            seedNodeOutputValue(scopedRoot, inputNode, value)
        }

        const triggers = findNodesByType(scopedRoot, ON_TRIGGER_TYPE)
        for (const trigger of triggers) {
            await executeGraph(trigger, undefined, options)
        }

        const byName = {}
        const outputNodes = findNodesByType(scopedRoot, OUTPUT_TYPE)
        for (const outputNode of outputNodes) {
            const name = String(outputNode.properties?.Name || '').trim() || 'output'
            byName[name] = await resolveNodeInputValue(outputNode, 'Value', options)
        }

        // Call output order: data outputs, then event outputs (null placeholders)
        const collected = []
        for (const out of dataOutputs) {
            collected.push(byName[out.name] ?? null)
        }
        for (let i = 0; i < eventOutputs.length; i++) {
            collected.push(null)
        }

        await behaviors.populateNextNodeLinks(collected)

        // Older subgraphs without Output Trigger nodes: fire default Done after inner work
        if (!hasExplicitOutputTriggers) {
            const groups = behaviors.getOutputNodeGroups()
            const slotIndex = dataOutputs.length
            if (slotIndex < groups.length) {
                await behaviors.triggerNodeGroup(groups[slotIndex] || [])
            }
        }
    }
}

const findEventOutputIndex = (node) => {
    if (!node?.outputs) return -1
    for (let i = node.outputs.length - 1; i >= 0; i--) {
        if (isEventType(node.outputs[i].type)) {
            return i
        }
    }
    return -1
}

module.exports = {
    ON_TRIGGER_TYPE,
    INPUT_TYPE,
    OUTPUT_TYPE,
    OUTPUT_TRIGGER_TYPE,
    EMPTY_LITEGRAPH,
    cloneGraph,
    defaultValueForType,
    normalizePortType,
    extractSignatureFromGraph,
    createEmptySubgraphGraph,
    buildSubgraphMetadata,
    createSubgraphRunner,
    findEventOutputIndex,
    resolveEventOutputs,
}
