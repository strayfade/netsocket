const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addOutput("", "string");
    }
}
NodeDefinition.prototype.title = "String/Trim"
NodeDefinition.prototype.description = "Removes leading and trailing whitespace from the input string."
NodeDefinition.prototype.portMeta = {
	inputs: {
		String: {"description":"Input \"String\" for Trim.","structure":"Plain text string (UTF-8).","required":true},
	},
	outputs: {
		"": {"description":"Primary output of Trim.","structure":"Plain text string (UTF-8).","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "content_cut"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([ string(params["String"]).trim() ]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }