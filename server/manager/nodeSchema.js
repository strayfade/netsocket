const {
    parseCallArguments,
    parseEnumPropertyCall,
    normalizeBooleanDefault,
} = require('./nodeImporter')

const normalizePortType = (type) => {
    if (type === 'LiteGraph.EVENT') return 'event'
    return String(type || 'string').replace(/^["']|["']$/g, '')
}

const extractNodeSchemaFromDefinition = (oNodeDefinition) => {
    const expectedInputs = []
    const expectedOutputs = []
    const foundProperties = []
    let pendingEnumProperty = ''
    const constructorLines = oNodeDefinition.prototype.constructor.toString().split('\n')
    let hasSkippedLines = 0
    let hasCompletedLines = 0

    for (let line of constructorLines) {
        hasCompletedLines++
        if (hasSkippedLines < 2) {
            hasSkippedLines++
            continue
        }
        if (hasCompletedLines >= constructorLines.length - 1) continue
        line = line.trim()

        if (pendingEnumProperty) {
            pendingEnumProperty += ` ${line}`
            if (!line.includes(']);')) {
                continue
            }
            const enumProperty = parseEnumPropertyCall(pendingEnumProperty)
            pendingEnumProperty = ''
            if (enumProperty) {
                foundProperties.push(enumProperty)
            }
            continue
        }

        if (line.includes('addInput')) {
            const params = parseCallArguments(line)
            if (params && params.length >= 2) {
                expectedInputs.push({
                    name: params[0],
                    type: normalizePortType(params[1]),
                })
            }
        } else if (line.includes('addOutput')) {
            const params = parseCallArguments(line)
            if (params && params.length >= 2) {
                expectedOutputs.push({
                    name: params[0],
                    type: normalizePortType(params[1]),
                })
            }
        } else if (line.includes('addEnumProperty')) {
            if (line.includes(']);')) {
                const enumProperty = parseEnumPropertyCall(line)
                if (enumProperty) {
                    foundProperties.push(enumProperty)
                }
            } else {
                pendingEnumProperty = line
            }
        } else if (line.includes('addProperty')) {
            const params = parseCallArguments(line)
            if (params && params.length >= 2) {
                foundProperties.push({
                    name: params[0],
                    defaultValue: params[1],
                })
            }
        }
    }

    const inputs = []
    const properties = []
    const remainingProperties = [...foundProperties]

    for (const input of expectedInputs) {
        const propertyIdx = remainingProperties.findIndex((property) => property.name === input.name)
        const property = propertyIdx >= 0 ? remainingProperties.splice(propertyIdx, 1)[0] : null
        const entry = {
            name: input.name,
            type: input.type,
            isEvent: input.type === 'event',
        }
        if (property && !entry.isEvent) {
            entry.defaultValue = input.type === 'boolean'
                ? normalizeBooleanDefault(property.defaultValue)
                : property.defaultValue
            if (property.enumValues) {
                entry.enumValues = property.enumValues
            }
        } else if (!entry.isEvent) {
            entry.defaultValue = input.type === 'boolean'
                ? 'False'
                : input.type === 'number'
                    ? '0'
                    : input.type === 'array'
                        ? '[]'
                        : input.type === 'object'
                            ? '{}'
                            : ''
        }
        inputs.push(entry)
    }

    for (const property of remainingProperties) {
        properties.push({
            name: property.name,
            defaultValue: property.defaultValue,
            enumValues: property.enumValues || null,
        })
    }

    const title = oNodeDefinition.prototype.title
    const slashIdx = title.indexOf('/')
    const category = slashIdx >= 0 ? title.slice(0, slashIdx) : title
    const shortName = slashIdx >= 0 ? title.slice(slashIdx + 1) : title

    const schema = {
        title,
        category,
        name: shortName,
        description: oNodeDefinition.prototype.description || '',
        color: oNodeDefinition.prototype.color || null,
        icon: oNodeDefinition.prototype.icon || null,
        inputs,
        outputs: expectedOutputs.map((output, index) => ({
            index,
            name: output.name,
            type: output.type,
            isEvent: output.type === 'event',
        })),
        properties,
    }

    if (oNodeDefinition.prototype.examples) {
        schema.examples = oNodeDefinition.prototype.examples
    }

    return schema
}

const exampleValueForType = (type) => {
    switch (type) {
        case 'number': return 1
        case 'boolean': return true
        case 'array': return []
        case 'object': return {}
        default: return 'example'
    }
}

const coerceExampleValue = (type, defaultValue) => {
    if (type === 'boolean') {
        const normalized = String(defaultValue || '').trim().toLowerCase()
        return normalized === 'true' || normalized === '1' || normalized === 'yes'
    }
    if (type === 'number') {
        const parsed = parseFloat(defaultValue)
        return Number.isFinite(parsed) ? parsed : 0
    }
    if (type === 'array') {
        try { return JSON.parse(defaultValue || '[]') } catch { return [] }
    }
    if (type === 'object') {
        try { return JSON.parse(defaultValue || '{}') } catch { return {} }
    }
    return defaultValue != null ? String(defaultValue) : exampleValueForType(type)
}

const buildExampleUsage = (schema) => {
    const inputs = {}
    const properties = {}

    for (const input of schema.inputs) {
        if (input.isEvent) continue
        inputs[input.name] = coerceExampleValue(input.type, input.defaultValue)
    }

    for (const property of schema.properties) {
        if (Object.prototype.hasOwnProperty.call(inputs, property.name)) continue
        properties[property.name] = coerceExampleValue('string', property.defaultValue)
    }

    return {
        nodeType: schema.title,
        inputs,
        properties,
    }
}

module.exports = {
    extractNodeSchemaFromDefinition,
    buildExampleUsage,
    exampleValueForType,
    coerceExampleValue,
}
