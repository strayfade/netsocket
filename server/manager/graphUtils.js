/** LiteGraph serialized link: [id, origin_id, origin_slot, target_id, target_slot, type] */
const LINK = {
    ID: 0,
    ORIGIN_ID: 1,
    ORIGIN_SLOT: 2,
    TARGET_ID: 3,
    TARGET_SLOT: 4,
    TYPE: 5,
}

const EVENT_TYPE = -1

const getLiteGraph = (graphRoot) => {
    const inner = graphRoot?.nodes
    if (!inner || !Array.isArray(inner.nodes)) {
        return null
    }
    return inner
}

const getGraphNodes = (graphRoot) => {
    const lg = getLiteGraph(graphRoot)
    return lg ? lg.nodes : []
}

const getGraphLinks = (graphRoot) => {
    const lg = getLiteGraph(graphRoot)
    return lg ? lg.links : []
}

const findLink = (graphRoot, linkId) => {
    return getGraphLinks(graphRoot).find((link) => link && link[LINK.ID] === linkId) ?? null
}

const findNodeById = (graphRoot, nodeId) => {
    return getGraphNodes(graphRoot).find((node) => node.id === nodeId) ?? null
}

const findNodesByType = (graphRoot, nodeType) => {
    return getGraphNodes(graphRoot).filter((node) => node.type === nodeType)
}

const isEventType = (type) => type === EVENT_TYPE

const isEventLink = (link) => link != null && isEventType(link[LINK.TYPE])

const hasEventPort = (ports) => {
    return Array.isArray(ports) && ports.some((port) => isEventType(port.type))
}

/** Value-only nodes have no event inputs or outputs and can be evaluated eagerly. */
const isPureNode = (node) => {
    if (!node) {
        return false
    }
    return !hasEventPort(node.inputs) && !hasEventPort(node.outputs)
}

const getLinkValue = (graphRoot, linkId) => {
    const values = graphRoot?.currentValues
    if (!Array.isArray(values)) {
        return null
    }
    return values[linkId] ?? null
}

const ensureLinkValueSlot = (graphRoot, linkId) => {
    if (!graphRoot.currentValues) {
        graphRoot.currentValues = []
    }
    while (graphRoot.currentValues.length <= linkId) {
        graphRoot.currentValues.push(null)
    }
    return graphRoot
}

const resolvePropertyInput = (properties, inputName) => {
    if (!properties || !Object.prototype.hasOwnProperty.call(properties, inputName)) {
        return null
    }
    return properties[inputName]
}

module.exports = {
    LINK,
    EVENT_TYPE,
    getLiteGraph,
    getGraphNodes,
    getGraphLinks,
    findLink,
    findNodeById,
    findNodesByType,
    isEventType,
    isEventLink,
    isPureNode,
    getLinkValue,
    ensureLinkValueSlot,
    resolvePropertyInput,
}
