const { log, logColors } = require('../log')
const NodeRegistry = require('./nodeImporter').getAvailableNodes()
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

async function resolveInputs(node, customInputs, runNode) {
    if (customInputs) {
        return customInputs
    }

    let graphRoot = getNodes()
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
                await runNode(connectedNode)
                graphRoot = getNodes()
            }
            inputs[input.name] = getLinkValue(graphRoot, link[LINK.ID])
        } else {
            inputs[input.name] = resolvePropertyInput(node.properties, input.name)
        }
    }

    return inputs
}

function populateOutputLinkValues(node, outputValues) {
    let graphRoot = getNodes()
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

    setNodes(graphRoot)
}

function getEventOutputGroups(node) {
    const graphRoot = getNodes()
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

async function executeGraph(nodeToTrigger, customInputs) {
    if (!nodeToTrigger) {
        return
    }

    const impl = NodeRegistry[nodeToTrigger.type]
    if (!impl) {
        log(`No implementation found for ${nodeToTrigger.type}`, logColors.Error)
        return
    }

    try {
        const behaviors = {
            populateNextNodeLinks: async (outputValues = []) => {
                populateOutputLinkValues(nodeToTrigger, outputValues)
            },
            getOutputNodeGroups: () => getEventOutputGroups(nodeToTrigger),
            triggerNodeGroup: async (nodes = []) => {
                for (const node of nodes) {
                    await executeGraph(node)
                }
            },
        }

        const inputs = await resolveInputs(nodeToTrigger, customInputs, executeGraph)
        await impl(nodeToTrigger.properties, inputs, behaviors)
    } catch (exception) {
        log(exception, logColors.Error)
    }
}

async function triggerNodesByType(nodeType, inputsOrBuilder, options = {}) {
    const graphRoot = getNodes()
    if (!getLiteGraph(graphRoot)) {
        return
    }

    const filter = options.filter
    const nodes = findNodesByType(graphRoot, nodeType)

    for (const node of nodes) {
        if (filter && !filter(node)) {
            continue
        }
        const inputs = typeof inputsOrBuilder === 'function'
            ? inputsOrBuilder(node)
            : inputsOrBuilder
        await executeGraph(node, inputs)
    }
}

module.exports = { executeGraph, triggerNodesByType }
