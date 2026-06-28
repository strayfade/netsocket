const { json, string, bool } = require('../../utils/inputParser')
const { flattenObject, unflattenObject } = require('../../utils/jsonTools')

class NodeDefinition {
    constructor() {
        this.addInput("JSON", "object");
        this.addProperty("JSON", "{}");
        this.addInput("Mode", "string");
        this.addEnumProperty("Mode", "Flatten", ["Flatten", "Unflatten"]);
        this.addOutput("Result", "object");
    }
}
NodeDefinition.prototype.title = "JSON/Flatten"
NodeDefinition.prototype.description = "Flattens nested objects into dot-notation keys or reverses the process to unflatten, depending on the selected mode."
NodeDefinition.prototype.portMeta = {
	inputs: {
		JSON: {"description":"JSON document as text.","structure":"JSON-encoded string.","required":true},
		Mode: {"description":"Input \"Mode\" for Flatten.","structure":"Plain text string (UTF-8).","required":false},
	},
	outputs: {
		Result: {"description":"Primary result of the node.","structure":"Computed result value.","mcpKey":"Result"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "unfold_more"

const NodeFunction = async (node, params, behaviors) => {
    const input = json(params.JSON)
    const mode = string(params.Mode).toLowerCase()
    const result = mode === 'unflatten'
        ? unflattenObject(input)
        : flattenObject(input)
    await behaviors.populateNextNodeLinks([result]);
    return true
}

module.exports = { NodeDefinition, NodeFunction }
