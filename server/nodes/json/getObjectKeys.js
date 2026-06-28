const { log, logColors } = require('../../log')
const { number, string, bool, json } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("JSON", "object");
        this.addProperty("JSON", "{}");
        this.addOutput("", "array");
    }
}
NodeDefinition.prototype.title = "JSON/Get Object Keys"
NodeDefinition.prototype.description = "Returns the top-level keys of a JSON object as a JSON array string."
NodeDefinition.prototype.portMeta = {
	inputs: {
		JSON: {"description":"JSON document as text.","structure":"JSON-encoded string.","required":true},
	},
	outputs: {
		"": {"description":"Primary output of Get Object Keys.","structure":"JSON array (may be serialized as a string in some nodes).","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_object"
const NodeFunction = async (node, params, behaviors) => {
    try {
        let object = json(params["JSON"])
        await behaviors.populateNextNodeLinks([JSON.stringify(Object.keys(object))]);
        return true
    }
    catch (e) {
        log(`Error: ${e}`)
        await behaviors.populateNextNodeLinks([ JSON.stringify([]) ]);
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }