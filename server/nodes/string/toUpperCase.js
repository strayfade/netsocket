const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addOutput("", "string");
    }
}
NodeDefinition.prototype.title = "String/To Upper Case"
NodeDefinition.prototype.description = "Converts the input string to upper case."
NodeDefinition.prototype.portMeta = {
	inputs: {
		String: {"description":"Input \"String\" for To Upper Case.","structure":"Plain text string (UTF-8).","required":true},
	},
	outputs: {
		"": {"description":"Primary output of To Upper Case.","structure":"Plain text string (UTF-8).","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "uppercase"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([ string(params["String"]).toUpperCase() ]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }
