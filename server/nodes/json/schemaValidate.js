const { json, string } = require('../../utils/inputParser')
const { validateJsonSchema } = require('../../utils/jsonTools')

class NodeDefinition {
    constructor() {
        this.addInput("JSON", "object");
        this.addProperty("JSON", "{}");
        this.addInput("Schema", "string");
        this.addProperty("Schema", "{\"type\":\"object\"}");
        this.addOutput("Valid", "boolean");
        this.addOutput("Errors", "string");
    }
}
NodeDefinition.prototype.title = "JSON/Schema Validate"
NodeDefinition.prototype.description = "Validates a JSON value against a JSON Schema and outputs whether it is valid plus a semicolon-separated list of error messages."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "rule"

const parseSchema = (input) => {
    if (input != null && typeof input === 'object') {
        return input
    }
    try {
        return JSON.parse(string(input))
    } catch {
        return null
    }
}

const NodeFunction = async (node, params, behaviors) => {
    const schema = parseSchema(params.Schema)
    if (!schema) {
        await behaviors.populateNextNodeLinks([false, 'Invalid schema JSON']);
        return false
    }

    const value = json(params.JSON)
    const result = validateJsonSchema(value, schema)
    await behaviors.populateNextNodeLinks([
        result.valid,
        result.errors.join('; '),
    ]);
    return result.valid
}

module.exports = { NodeDefinition, NodeFunction }
