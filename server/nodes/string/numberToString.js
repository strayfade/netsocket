const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Number", "number");
        this.addOutput("String", "string");
    }
}
NodeDefinition.prototype.title = "String/To String (number)"
NodeDefinition.prototype.description = "Converts a number input to its string representation."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Number: {"description":"Input \"Number\" for To String (number).","structure":"Numeric value (integer or float).","required":true},
	},
	outputs: {
		String: {"description":"String produced by To String (number).","structure":"Plain text string (UTF-8).","mcpKey":"String"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "convert_to_text"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([number(params.Number).toString()]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }