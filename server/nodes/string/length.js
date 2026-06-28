const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "String/Length"
NodeDefinition.prototype.description = "Returns the character count of the input string."
NodeDefinition.prototype.portMeta = {
	inputs: {
		String: {"description":"Input \"String\" for Length.","structure":"Plain text string (UTF-8).","required":true},
	},
	outputs: {
		"": {"description":"Primary output of Length.","structure":"Numeric value (integer or float).","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "straighten"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([ number(string(params["String"]).length.toString()) ]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }