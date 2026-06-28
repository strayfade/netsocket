const { log } = require('../../log')
const { json } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Array", "array");
        this.addOutput("String", "string");
    }
}
NodeDefinition.prototype.title = "String/To String (array)"
NodeDefinition.prototype.description = "Converts a JSON array into its JSON string representation."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Array: {"description":"Input \"Array\" for To String (array).","structure":"JSON array (may be serialized as a string in some nodes).","required":true},
	},
	outputs: {
		String: {"description":"String produced by To String (array).","structure":"Plain text string (UTF-8).","mcpKey":"String"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "convert_to_text"
const NodeFunction = async (node, params, behaviors) => {
    try {
        const arr = json(params["Array"])
        await behaviors.populateNextNodeLinks([JSON.stringify(arr)]);
        return true
    }
    catch (e) {
        log(`Error: ${e}`)
        await behaviors.populateNextNodeLinks(["[]"]);
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }
