const { log, logColors } = require('../log')
const { getAvailableNodes } = require('./nodeImporter')
const { getNodes, setNodes } = require('./saveState')
const {
    LINK,
    findLink,
    findNodeById,
    getLiteGraph,
    findNodesByType,
    isEventLink,
    isPureNode,
    getLinkValue,
    ensureLinkValueSlot,
    resolvePropertyInput,
} = require('./graphUtils')

const MAX_SUBGRAPH_DEPTH = 16

function resolveGraphContext(options = {}) {
    if (options.graphRoot) {
        return {
            getRoot: () => options.graphRoot,
            persistRoot: (root) => {
                options.graphRoot = root
                if (typeof options.setGraphRoot === 'function') {
                    options.setGraphRoot(root)
                }
            },
            isScoped: true,
        }
    }
    return {
        getRoot: () => getNodes(),
        persistRoot: (root) => setNodes(root),
        isScoped: false,
    }
}

async function resolveInputs(node, customInputs, runNode, options = {}) {
    if (customInputs) {
        return customInputs
    }

    const ctx = resolveGraphContext(options)
    let graphRoot = ctx.getRoot()
    const inputs = {}

    if (!node.inputs) {
        if (node.properties) {
            Object.assign(inputs, node.properties)
        }
        return inputs
    }

    for (const input of node.inputs) {
        if (input.link != null) {
            const link = findLink(graphRoot, input.link)
            if (!link || isEventLink(link)) {
                continue
            }

            const connectedNode = findNodeById(graphRoot, link[LINK.ORIGIN_ID])
            if (isPureNode(connectedNode)) {
                await runNode(connectedNode, undefined, options)
                graphRoot = ctx.getRoot()
            }
            inputs[input.name] = getLinkValue(graphRoot, link[LINK.ID])
        } else {
            inputs[input.name] = resolvePropertyInput(node.properties, input.name)
        }
    }

    return inputs
}

function populateOutputLinkValues(node, outputValues, options = {}) {
    const ctx = resolveGraphContext(options)
    let graphRoot = ctx.getRoot()
    if (!node.outputs) {
        return
    }

    for (let outIdx = 0; outIdx < node.outputs.length; outIdx++) {
        const output = node.outputs[outIdx]
        if (!output.links) {
            continue
        }
        const value = outIdx < outputValues.length ? outputValues[outIdx] : undefined
        for (const linkId of output.links) {
            graphRoot = ensureLinkValueSlot(graphRoot, linkId)
            if (value !== undefined) {
                graphRoot.currentValues[linkId] = value
            }
        }
    }

    ctx.persistRoot(graphRoot)
}

function getEventOutputGroups(node, options = {}) {
    const ctx = resolveGraphContext(options)
    const graphRoot = ctx.getRoot()
    const groups = []
    if (!node.outputs) {
        return groups
    }

    for (let outIdx = 0; outIdx < node.outputs.length; outIdx++) {
        const output = node.outputs[outIdx]
        const group = []
        if (output.links) {
            for (const linkId of output.links) {
                const link = findLink(graphRoot, linkId)
                if (!link || !isEventLink(link)) {
                    continue
                }
                const target = findNodeById(graphRoot, link[LINK.TARGET_ID])
                if (target) {
                    group.push(target)
                }
            }
        }
        groups[outIdx] = group
    }

    return groups
}

async function executeGraph(nodeToTrigger, customInputs, options = {}) {
    if (!nodeToTrigger) {
        return
    }

    const depth = options.depth || 0
    if (depth > MAX_SUBGRAPH_DEPTH) {
        log(`Subgraph nesting exceeded max depth (${MAX_SUBGRAPH_DEPTH})`, logColors.Error)
        return
    }

    const NodeRegistry = getAvailableNodes()
    const impl = NodeRegistry[nodeToTrigger.type]
    if (!impl) {
        log(`No implementation found for ${nodeToTrigger.type}`, logColors.Error)
        return
    }

    try {
        const behaviors = {
            populateNextNodeLinks: async (outputValues = []) => {
                populateOutputLinkValues(nodeToTrigger, outputValues, options)
            },
            getOutputNodeGroups: () => getEventOutputGroups(nodeToTrigger, options),
            triggerNodeGroup: async (nodes = []) => {
                for (const node of nodes) {
                    await executeGraph(node, undefined, options)
                }
            },
            __executeOptions: options,
        }

        const inputs = await resolveInputs(
            nodeToTrigger,
            customInputs,
            executeGraph,
            options
        )
        await impl(nodeToTrigger.properties, inputs, behaviors)
    } catch (exception) {
        log(exception, logColors.Error)
    }
}

async function triggerNodesByType(nodeType, inputsOrBuilder, options = {}) {
    const graphRoot = options.graphRoot || getNodes()
    if (!getLiteGraph(graphRoot)) {
        return
    }

    const filter = options.filter
    const nodes = findNodesByType(graphRoot, nodeType)
    const execOptions = options.graphRoot ? options : {}

    for (const node of nodes) {
        if (filter && !filter(node)) {
            continue
        }
        const inputs = typeof inputsOrBuilder === 'function'
            ? inputsOrBuilder(node)
            : inputsOrBuilder
        await executeGraph(node, inputs, execOptions)
    }
}

function seedNodeOutputValue(graphRoot, node, value) {
    if (!node || !node.outputs || !node.outputs[0]) {
        return graphRoot
    }
    if (!node.properties) {
        node.properties = {}
    }
    node.properties._value = value

    const links = node.outputs[0].links || []
    for (const linkId of links) {
        graphRoot = ensureLinkValueSlot(graphRoot, linkId)
        graphRoot.currentValues[linkId] = value
    }
    return graphRoot
}

async function resolveNodeInputValue(node, inputName, options = {}) {
    const ctx = resolveGraphContext(options)
    let graphRoot = ctx.getRoot()
    if (!node.inputs) {
        return resolvePropertyInput(node.properties, inputName)
    }
    const input = node.inputs.find((port) => port.name === inputName) || node.inputs[0]
    if (!input) {
        return resolvePropertyInput(node.properties, inputName)
    }
    if (input.link != null) {
        const link = findLink(graphRoot, input.link)
        if (!link || isEventLink(link)) {
            return resolvePropertyInput(node.properties, input.name)
        }
        const connectedNode = findNodeById(graphRoot, link[LINK.ORIGIN_ID])
        if (isPureNode(connectedNode)) {
            await executeGraph(connectedNode, undefined, options)
            graphRoot = ctx.getRoot()
        }
        return getLinkValue(graphRoot, link[LINK.ID])
    }
    return resolvePropertyInput(node.properties, input.name)
}

module.exports = {
    executeGraph,
    triggerNodesByType,
    resolveInputs,
    populateOutputLinkValues,
    getEventOutputGroups,
    seedNodeOutputValue,
    resolveNodeInputValue,
    MAX_SUBGRAPH_DEPTH,
}
