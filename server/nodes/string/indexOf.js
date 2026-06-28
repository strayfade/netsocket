const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addInput("Search for", "string");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "String/Index Of"
NodeDefinition.prototype.description = "Returns the zero-based index of the first occurrence of a search substring, or -1 if not found."
NodeDefinition.prototype.portMeta = {
	inputs: {
		String: {"description":"Input \"String\" for Index Of.","structure":"Plain text string (UTF-8).","required":true},
		"Search for": {"description":"Input \"Search for\" for Index Of.","structure":"Plain text string (UTF-8).","required":true},
	},
	outputs: {
		"": {"description":"Primary output of Index Of.","structure":"Numeric value (integer or float).","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "document_search"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([string(params["String"]).indexOf(string(params["Search for"]))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }