const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("JSON", "string");
        this.addProperty("JSON", "{}");
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "JSON/Validate"
NodeDefinition.prototype.description = "Checks whether a string is valid JSON and outputs true or false."
NodeDefinition.prototype.portMeta = {
	inputs: {
		JSON: {"description":"JSON document as text.","structure":"JSON-encoded string.","required":false},
	},
	outputs: {
		"": {"description":"Primary output of Validate.","structure":"Boolean true or false.","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_object"
const NodeFunction = async (node, params, behaviors) => {
    try {
        JSON.parse(string(params.JSON))
        await behaviors.populateNextNodeLinks([true]);
        return true
    }
    catch {
        await behaviors.populateNextNodeLinks([false]);
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }