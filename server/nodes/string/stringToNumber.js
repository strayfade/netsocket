const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addOutput("Number", "number");
    }
}
NodeDefinition.prototype.title = "String/To Number (String)"
NodeDefinition.prototype.description = "Converts a string input to a number using parseFloat."
NodeDefinition.prototype.portMeta = {
	inputs: {
		String: {"description":"Input \"String\" for To Number (String).","structure":"Plain text string (UTF-8).","required":true},
	},
	outputs: {
		Number: {"description":"Number produced by To Number (String).","structure":"Numeric value (integer or float).","mcpKey":"Number"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "convert_to_text"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([parseFloat(string(params.String))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }
