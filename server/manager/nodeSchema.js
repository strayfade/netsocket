const {
    parseCallArguments,
    parseEnumPropertyCall,
    normalizeBooleanDefault,
} = require('./nodeImporter')

const PORT_TYPE_STRUCTURES = {
    string: 'Plain text string (UTF-8).',
    number: 'Numeric value (integer or float).',
    boolean: 'Boolean true or false.',
    array: 'JSON array (may be serialized as a string in some nodes).',
    object: 'JSON object (may be serialized as a string in some nodes).',
    event: 'Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.',
}

const PORT_NAME_HINTS = {
    URL: { structure: 'HTTP or HTTPS URL string.', description: 'Request target URL.' },
    ID: { structure: 'Resource identifier string.', description: 'Unique ID of the target resource.' },
    Name: { structure: 'Human-readable name string.', description: 'Resource name to look up or update.' },
    'Color (hex)': {
        structure: 'Hex color code such as #ff0000; use #000000 or black to turn a Hue light off.',
        description: 'Target light color in hex notation.',
    },
    Prompt: { structure: 'Natural-language prompt text.', description: 'Main prompt sent to the model.' },
    'System Prompt': { structure: 'System/instruction prompt text.', description: 'System instructions for the model.' },
    Model: { structure: 'Model identifier string (provider-specific).', description: 'Language model name or ID.' },
    Query: { structure: 'Search query string.', description: 'Web search query text.' },
    Command: { structure: 'Natural-language command for the agent.', description: 'User command to execute.' },
    Account: { structure: 'OTP account key in Issuer:Account format.', description: 'TOTP account identifier.' },
    Token: { structure: 'Authentication or API token string.', description: 'Bearer/API token value.' },
    Headers: { structure: 'JSON object of HTTP header names to values.', description: 'Optional HTTP request headers.' },
    Body: { structure: 'Request body string (often JSON).', description: 'HTTP request payload.' },
    Path: { structure: 'URL path or route string.', description: 'HTTP path segment.' },
    Method: { structure: 'HTTP method name such as GET or POST.', description: 'HTTP verb to use.' },
    Variable: { structure: 'Variable name string.', description: 'Name of the runtime variable.' },
    Value: { structure: 'Value to store or compare.', description: 'Data value for the operation.' },
    Key: { structure: 'Object key or lookup key string.', description: 'Key used for lookup or assignment.' },
    JSON: { structure: 'JSON-encoded string.', description: 'JSON document as text.' },
    Schema: { structure: 'JSON Schema document as a string.', description: 'Schema used for validation or structured output.' },
    Lights: {
        structure: 'Array of Philips Hue light objects (id, name, state, type, etc.).',
        description: 'All lights registered on the Hue bridge.',
    },
    Response: { structure: 'Text response from the operation.', description: 'Primary text output.' },
    Error: { structure: 'Error message string; empty when successful.', description: 'Error details when execution fails.' },
    Result: { structure: 'Computed result value.', description: 'Primary result of the node.' },
    Output: { structure: 'Transformed or computed output value.', description: 'Main output value.' },
    Original: { structure: 'Source string to transform.', description: 'Input text before processing.' },
    Timestamp: { structure: 'Unix timestamp in milliseconds or ISO date string.', description: 'Point in time for the operation.' },
    Date: { structure: 'Date string parseable by the runtime.', description: 'Calendar date input.' },
    Duration: { structure: 'Duration string or numeric offset.', description: 'Time span to add or compare.' },
    Email: { structure: 'Email address string.', description: 'Recipient or account email.' },
    Subject: { structure: 'Email subject line.', description: 'Message subject.' },
    Message: { structure: 'Message body text.', description: 'Content to send or log.' },
    Code: { structure: 'Source code or script string.', description: 'JavaScript or command text to run.' },
}

const normalizePortType = (type) => {
    if (type === 'LiteGraph.EVENT') return 'event'
    return String(type || 'string').replace(/^["']|["']$/g, '')
}

const humanizePortName = (name) => {
    const trimmed = String(name || '').trim()
    if (!trimmed) return 'value'
    return trimmed
}

const inferPortDescription = (name, type, direction, nodeTitle) => {
    const hints = PORT_NAME_HINTS[name]
    if (hints?.description) return hints.description

    const label = humanizePortName(name)
    const leafTitle = String(nodeTitle || '').split('/').pop() || nodeTitle

    if (direction === 'input') {
        if (type === 'event') {
            return 'Execution trigger for graph flows; not supplied in standalone MCP calls.'
        }
        return `Input "${label}" for ${leafTitle}.`
    }

    if (type === 'event') {
        return 'Event fired when the node completes (graph flows only).'
    }
    if (name) {
        return `${label} produced by ${leafTitle}.`
    }
    return `Primary output of ${leafTitle}.`
}

const inferPortStructure = (name, type, nodeTitle) => {
    const hints = PORT_NAME_HINTS[name]
    if (hints?.structure) return hints.structure

    if (type === 'array' && /Hue|Lights/i.test(nodeTitle)) {
        return 'Array of Philips Hue resource objects.'
    }
    if (type === 'object' && /JSON/i.test(nodeTitle)) {
        return 'JSON object; may be returned as a parsed object or JSON string depending on the node.'
    }
    if (type === 'string' && /Request|Web\//i.test(nodeTitle)) {
        return 'Text response body (often JSON serialized as a string).'
    }

    return PORT_TYPE_STRUCTURES[type] || PORT_TYPE_STRUCTURES.string
}

const resolveOutputMcpKey = (output, index) => (output.name ? output.name : `output_${index}`)

const hasMeaningfulDefault = (input) => {
    if (input.defaultValue == null) return false
    const value = String(input.defaultValue).trim()
    if (input.type === 'number') return value !== '' && value !== '0' && value !== '0.0'
    if (input.type === 'boolean') return value.toLowerCase() === 'true'
    if (input.type === 'array') return value !== '[]'
    if (input.type === 'object') return value !== '{}'
    return value !== ''
}

const buildPortMetaEntry = (port, direction, context = {}) => {
    const { nodeTitle = '', overrides = null, index = 0 } = context
    const type = port.type
    const name = port.name

    const entry = {
        description: inferPortDescription(name, type, direction, nodeTitle),
        structure: inferPortStructure(name, type, nodeTitle),
    }

    if (direction === 'input') {
        if (type === 'event') {
            entry.mcpOmit = true
        } else {
            entry.required = !hasMeaningfulDefault(port)
        }
    } else if (type !== 'event') {
        entry.mcpKey = resolveOutputMcpKey(port, index)
    } else {
        entry.mcpOmit = true
    }

    if (overrides && typeof overrides === 'object') {
        return { ...entry, ...overrides }
    }

    return entry
}

const generatePortMeta = (schema, overrides = null) => {
    const nodeTitle = schema.title
    const inputOverrides = overrides?.inputs || {}
    const outputOverrides = overrides?.outputs || {}

    const inputs = {}
    for (const input of schema.inputs) {
        inputs[input.name] = buildPortMetaEntry(input, 'input', {
            nodeTitle,
            overrides: inputOverrides[input.name] || null,
        })
    }

    const outputs = {}
    for (const output of schema.outputs) {
        outputs[output.name] = buildPortMetaEntry(output, 'output', {
            nodeTitle,
            index: output.index,
            overrides: outputOverrides[output.name] || null,
        })
    }

    return { inputs, outputs }
}

const enrichPort = (port, meta, direction, index) => {
    const enriched = { ...port }
    const resolvedMeta = meta || buildPortMetaEntry(port, direction, { nodeTitle: '', index })

    enriched.description = resolvedMeta.description
    enriched.structure = resolvedMeta.structure

    if (direction === 'input') {
        enriched.required = resolvedMeta.required === true
        if (resolvedMeta.mcpOmit) enriched.mcpOmit = true
    } else {
        enriched.mcpKey = resolvedMeta.mcpKey || resolveOutputMcpKey(port, index)
        if (resolvedMeta.mcpOmit) enriched.mcpOmit = true
    }

    if (resolvedMeta.example != null) {
        enriched.example = resolvedMeta.example
    }

    return enriched
}

const enrichSchemaPorts = (schema, portMeta) => {
    const mergedMeta = generatePortMeta(schema, portMeta)

    return {
        ...schema,
        inputs: schema.inputs.map((input) => enrichPort(input, mergedMeta.inputs[input.name], 'input', input.index)),
        outputs: schema.outputs.map((output) => enrichPort(output, mergedMeta.outputs[output.name], 'output', output.index)),
        portMeta: mergedMeta,
    }
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

    if (oNodeDefinition.prototype.mcpPreferred != null) {
        schema.mcpPreferred = oNodeDefinition.prototype.mcpPreferred
    }

    const portMetaOverrides = oNodeDefinition.prototype.portMeta || null
    return enrichSchemaPorts(schema, portMetaOverrides)
}

const formatPortSummary = (port) => ({
    name: port.name || port.mcpKey,
    type: port.type,
    structure: port.structure,
    description: port.description,
    ...(port.required != null ? { required: port.required } : {}),
    ...(port.defaultValue !== undefined ? { defaultValue: port.defaultValue } : {}),
    ...(port.enumValues ? { enumValues: port.enumValues } : {}),
    ...(port.mcpKey ? { mcpKey: port.mcpKey } : {}),
    ...(port.example != null ? { example: port.example } : {}),
})

const buildMcpCallingGuide = (schema) => {
    const mcpInputs = schema.inputs.filter((input) => !input.isEvent && !input.mcpOmit)
    const mcpOutputs = schema.outputs.filter((output) => !output.isEvent && !output.mcpOmit)
    const requiredInputs = mcpInputs.filter((input) => input.required)
    const optionalInputs = mcpInputs.filter((input) => !input.required)

    const notes = [
        'Call execute_node with nodeType set to the exact title string shown in get_node_info.',
        'Pass data inputs in execute_node.inputs keyed by input name. Event inputs are not used in standalone MCP execution.',
        'Use execute_node.properties only for settings that are not already listed as inputs.',
        'On success, read execute_node.outputs (named map) or execute_node.outputSlots (ordered list with types).',
        'Chain nodes by passing prior execute_node.outputs values into the next execute_node.inputs object.',
    ]

    if (schema.mcpPreferred) {
        notes.unshift(typeof schema.mcpPreferred === 'string'
            ? schema.mcpPreferred
            : 'This node is marked mcpPreferred when multiple nodes can fulfill the task.')
    }

    return {
        summary: schema.description || `Execute ${schema.title}.`,
        executeNode: {
            nodeType: schema.title,
            inputs: {
                required: requiredInputs.map(formatPortSummary),
                optional: optionalInputs.map(formatPortSummary),
            },
            properties: schema.properties.map((property) => ({
                name: property.name,
                defaultValue: property.defaultValue,
                enumValues: property.enumValues || undefined,
                structure: 'Node setting override; use when the value is not declared as an input port.',
            })),
            outputs: mcpOutputs.map(formatPortSummary),
        },
        typeReference: PORT_TYPE_STRUCTURES,
        notes,
    }
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
        if (input.isEvent || input.mcpOmit) continue
        inputs[input.name] = coerceExampleValue(input.type, input.defaultValue)
    }

    for (const property of schema.properties) {
        if (Object.prototype.hasOwnProperty.call(inputs, property.name)) continue
        properties[property.name] = coerceExampleValue('string', property.defaultValue)
    }

    const expectedOutputs = {}
    for (const output of schema.outputs) {
        if (output.isEvent || output.mcpOmit) continue
        expectedOutputs[output.mcpKey || resolveOutputMcpKey(output, output.index)] = {
            type: output.type,
            structure: output.structure,
            description: output.description,
        }
    }

    return {
        nodeType: schema.title,
        inputs,
        properties,
        expectedOutputs,
    }
}

const isValidIdentifier = (key) => /^[$A-Z_][0-9A-Z_$]*$/i.test(String(key))

const renderPortMetaKey = (key) => (isValidIdentifier(key) ? String(key) : JSON.stringify(key))

const serializePortMetaValue = (value, indent = 0) => {
    const pad = '\t'.repeat(indent)
    const nextPad = '\t'.repeat(indent + 1)

    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
        return JSON.stringify(value)
    }

    const entries = Object.entries(value)
    if (!entries.length) return '{}'

    const lines = entries.map(([key, entryValue]) => {
        const renderedKey = renderPortMetaKey(key)
        if (entryValue && typeof entryValue === 'object' && !Array.isArray(entryValue)) {
            const inner = Object.entries(entryValue)
                .map(([innerKey, innerValue]) => `${nextPad}\t${renderPortMetaKey(innerKey)}: ${JSON.stringify(innerValue)},`)
                .join('\n')
            return `${nextPad}${renderedKey}: {\n${inner}\n${nextPad}},`
        }
        return `${nextPad}${renderedKey}: ${JSON.stringify(entryValue)},`
    })

    return `{\n${lines.join('\n')}\n${pad}}`
}

const formatPortMetaAssignment = (portMeta) =>
    `NodeDefinition.prototype.portMeta = ${serializePortMetaValue(portMeta, 0)}`

module.exports = {
    PORT_TYPE_STRUCTURES,
    extractNodeSchemaFromDefinition,
    generatePortMeta,
    enrichSchemaPorts,
    buildMcpCallingGuide,
    buildExampleUsage,
    formatPortMetaAssignment,
    exampleValueForType,
    coerceExampleValue,
    resolveOutputMcpKey,
}
