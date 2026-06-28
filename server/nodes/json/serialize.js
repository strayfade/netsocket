const { log, logColors } = require('../../log')
const { json } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("JSON", "object");
        this.addProperty("JSON", "{}");
        this.addOutput("", "string");
    }
}
NodeDefinition.prototype.title = "JSON/Serialize"
NodeDefinition.prototype.description = "Converts a JSON object or array into a compact JSON string."
NodeDefinition.prototype.portMeta = {
	inputs: {
		JSON: {"description":"JSON document as text.","structure":"JSON-encoded string.","required":true},
	},
	outputs: {
		"": {"description":"Primary output of Serialize.","structure":"Plain text string (UTF-8).","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_object"
const NodeFunction = async (node, params, behaviors) => {
    try {
        const input = params["JSON"]
        let value = input
        if (input == null || input === '')
            value = json(input)
        else if (typeof input === 'string') {
            try {
                value = JSON.parse(input)
            } catch {
                value = input
            }
        }
        await behaviors.populateNextNodeLinks([JSON.stringify(value)]);
        return true
    }
    catch (e) {
        log(`Error: ${e}`, logColors.Error)
        await behaviors.populateNextNodeLinks(["{}"]);
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }
