const { log, logColors } = require('../../log')
const { number, string, bool, json } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("JSON", "object");
        this.addProperty("JSON", "{}");
        this.addInput("Key Name", "string");
        this.addInput("New Item", "object");
        this.addOutput("", "object");
    }
}
NodeDefinition.prototype.title = "JSON/Set Object Value"
NodeDefinition.prototype.description = "Sets or overwrites a property on a JSON object by key name and outputs the modified object."
NodeDefinition.prototype.portMeta = {
	inputs: {
		JSON: {"description":"JSON document as text.","structure":"JSON-encoded string.","required":true},
		"Key Name": {"description":"Input \"Key Name\" for Set Object Value.","structure":"Plain text string (UTF-8).","required":true},
		"New Item": {"description":"Input \"New Item\" for Set Object Value.","structure":"JSON object; may be returned as a parsed object or JSON string depending on the node.","required":true},
	},
	outputs: {
		"": {"description":"Primary output of Set Object Value.","structure":"JSON object; may be returned as a parsed object or JSON string depending on the node.","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_object"
const NodeFunction = async (node, params, behaviors) => {
    try {
        let object = json(params["JSON"])
        object[string(params["Key Name"])] = json(params["New Item"])
        await behaviors.populateNextNodeLinks([ object ]);
        return true
    }
    catch (e) {
        log(e)
        await behaviors.populateNextNodeLinks([ {} ]);
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }