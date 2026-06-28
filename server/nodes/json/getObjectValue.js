const { log, logColors } = require('../../log')
const { number, string, bool, json } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("JSON", "object");
        this.addProperty("JSON", "{}");
        this.addInput("Key Name", "string");
        this.addOutput("", "object");
    }
}
NodeDefinition.prototype.title = "JSON/Get Object Value"
NodeDefinition.prototype.description = "Looks up a property by key name in a JSON object and outputs its value."
NodeDefinition.prototype.portMeta = {
	inputs: {
		JSON: {"description":"JSON document as text.","structure":"JSON-encoded string.","required":true},
		"Key Name": {"description":"Input \"Key Name\" for Get Object Value.","structure":"Plain text string (UTF-8).","required":true},
	},
	outputs: {
		"": {"description":"Primary output of Get Object Value.","structure":"JSON object; may be returned as a parsed object or JSON string depending on the node.","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_object"
const NodeFunction = async (node, params, behaviors) => {
    try {
        let object = json(params["JSON"])
        let keyValue = object[params["Key Name"]]
        await behaviors.populateNextNodeLinks([ keyValue ]);
        return true
    }
    catch (e) {
        log(e)
        await behaviors.populateNextNodeLinks([ {} ]);
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }