const { log, logColors } = require('../../log')
const { json } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("JSON String", "string");
        this.addProperty("JSON String", "{}");
        this.addOutput("", "array");
    }
}
NodeDefinition.prototype.title = "JSON/Deserialize"
NodeDefinition.prototype.description = "Parses a JSON string into a structured value and outputs it as a JSON string."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"JSON String": {"description":"Input \"JSON String\" for Deserialize.","structure":"Plain text string (UTF-8).","required":false},
	},
	outputs: {
		"": {"description":"Primary output of Deserialize.","structure":"JSON array (may be serialized as a string in some nodes).","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_object"
const NodeFunction = async (node, params, behaviors) => {
    try {
        const parsed = json(params["JSON String"])
        await behaviors.populateNextNodeLinks([JSON.stringify(parsed)]);
        return true
    }
    catch (e) {
        log(`Error: ${e}`)
        await behaviors.populateNextNodeLinks([[]]);
        return false;
    }
}
module.exports = { NodeDefinition, NodeFunction }
