const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addProperty("String", "abc");
        this.addInput("Regex", "string");
        this.addProperty("Regex", ".*");
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "String/Regex"
NodeDefinition.prototype.description = "Tests whether the input string matches a regular expression pattern and outputs true or false."
NodeDefinition.prototype.portMeta = {
	inputs: {
		String: {"description":"Input \"String\" for Regex.","structure":"Plain text string (UTF-8).","required":false},
		Regex: {"description":"Input \"Regex\" for Regex.","structure":"Plain text string (UTF-8).","required":false},
	},
	outputs: {
		"": {"description":"Primary output of Regex.","structure":"Boolean true or false.","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "regular_expression"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([new RegExp(string(params["Regex"])).test(string(params["String"]))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }