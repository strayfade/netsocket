const { log, logColors } = require('../../log')
const { string } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addProperty("String", "{}");
        this.addOutput("", "JSON");
    }
}
NodeDefinition.prototype.title = "JSON/Parse"
NodeDefinition.prototype.description = "Converts a JSON string into an object."
NodeDefinition.prototype.portMeta = {
	inputs: {
		String: {"description":"JSON text to parse into an object.","structure":"JSON-encoded string.","required":false},
	},
	outputs: {
		"": {"description":"Parsed object or array.","structure":"JSON object; may be returned as a parsed object or JSON string depending on the node.","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_object"
const NodeFunction = async (node, params, behaviors) => {
    try {
        const raw = params["String"]
        if (typeof raw === "object" && raw !== null) {
            await behaviors.populateNextNodeLinks([raw]);
            return true
        }
        const text = string(raw)
        if (!text || text.trim() === "") {
            await behaviors.populateNextNodeLinks([{}]);
            return true
        }
        const parsed = JSON.parse(text)
        await behaviors.populateNextNodeLinks([parsed]);
        return true
    }
    catch (e) {
        log(`JSON/Parse error: ${e}`, logColors.Error)
        await behaviors.populateNextNodeLinks([{}]);
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }
