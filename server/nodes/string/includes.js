const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addInput("Search for", "string");
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "String/Includes"
NodeDefinition.prototype.description = "Outputs true if the input string contains the search substring."
NodeDefinition.prototype.portMeta = {
	inputs: {
		String: {"description":"Input \"String\" for Includes.","structure":"Plain text string (UTF-8).","required":true},
		"Search for": {"description":"Input \"Search for\" for Includes.","structure":"Plain text string (UTF-8).","required":true},
	},
	outputs: {
		"": {"description":"Primary output of Includes.","structure":"Boolean true or false.","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "document_search"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([string(params["String"]).includes(string(params["Search for"]))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }