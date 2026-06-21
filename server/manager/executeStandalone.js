const { log, logColors } = require('../log')
const { getAvailableNodes, getNodeMetadata } = require('./nodeImporter')

const buildDefaultProperties = (schema, overrides = {}) => {
    const properties = {}
    for (const input of schema.inputs) {
        if (input.isEvent) continue
        if (input.defaultValue !== undefined) {
            properties[input.name] = input.defaultValue
        }
    }
    for (const property of schema.properties) {
        if (!Object.prototype.hasOwnProperty.call(properties, property.name)) {
            properties[property.name] = property.defaultValue
        }
    }
    return { ...properties, ...overrides }
}

const buildResolvedInputs = (schema, inputs = {}, properties = {}) => {
    const resolved = { ...properties, ...inputs }
    for (const input of schema.inputs) {
        if (input.isEvent) continue
        if (!Object.prototype.hasOwnProperty.call(resolved, input.name)) {
            resolved[input.name] = input.defaultValue ?? null
        }
    }
    return resolved
}

const formatOutputResult = (schema, outputValues, triggeredEventOutputs) => {
    const named = {}
    const slots = []

    for (let idx = 0; idx < schema.outputs.length; idx++) {
        const output = schema.outputs[idx]
        const value = idx < outputValues.length ? outputValues[idx] : undefined
        if (output.isEvent) continue

        const key = output.name || `output_${idx}`
        named[key] = value
        slots.push({
            index: idx,
            name: output.name,
            type: output.type,
            value,
        })
    }

    const eventsTriggered = triggeredEventOutputs.map((idx) => {
        const output = schema.outputs[idx] || {}
        return {
            index: idx,
            name: output.name || '',
        }
    })

    return { named, slots, eventsTriggered }
}

async function executeStandaloneNode(nodeType, options = {}) {
    const schema = getNodeMetadata(nodeType)
    if (!schema) {
        const error = new Error(`Unknown node type: ${nodeType}`)
        error.code = 'UNKNOWN_NODE'
        throw error
    }

    const impl = getAvailableNodes()[nodeType]
    if (!impl) {
        const error = new Error(`No implementation registered for node type: ${nodeType}`)
        error.code = 'NO_IMPLEMENTATION'
        throw error
    }

    const inputs = options.inputs && typeof options.inputs === 'object' ? options.inputs : {}
    const propertyOverrides = options.properties && typeof options.properties === 'object'
        ? options.properties
        : {}

    const mergedProperties = buildDefaultProperties(schema, propertyOverrides)
    const resolvedInputs = buildResolvedInputs(schema, inputs, mergedProperties)

    const outputValues = []
    const triggeredEventOutputs = []

    const behaviors = {
        populateNextNodeLinks: async (values = []) => {
            outputValues.length = 0
            outputValues.push(...values)
        },
        getOutputNodeGroups: () => schema.outputs.map((output, idx) => {
            if (!output.isEvent) return []
            return [{ __standaloneEventIndex: idx }]
        }),
        triggerNodeGroup: async (nodes = []) => {
            for (const node of nodes) {
                if (node && typeof node.__standaloneEventIndex === 'number') {
                    triggeredEventOutputs.push(node.__standaloneEventIndex)
                }
            }
        },
    }

    let success = true
    let errorMessage = null

    try {
        const result = await impl(mergedProperties, resolvedInputs, behaviors)
        if (result === false) {
            success = false
            errorMessage = 'Node returned false'
        }
    } catch (exception) {
        success = false
        errorMessage = exception?.message || String(exception)
        log(`Standalone node ${nodeType}: ${errorMessage}`, logColors.Error)
    }

    const outputs = formatOutputResult(schema, outputValues, triggeredEventOutputs)

    return {
        success,
        nodeType,
        inputs: resolvedInputs,
        properties: mergedProperties,
        outputs: outputs.named,
        outputSlots: outputs.slots,
        eventsTriggered: outputs.eventsTriggered,
        error: errorMessage,
    }
}

module.exports = { executeStandaloneNode, buildDefaultProperties, buildResolvedInputs }
