const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "string");
        this.addInput("B", "string");
        this.addInput("C", "string");
        this.addOutput("", "string");
    }
}
NodeDefinition.prototype.title = "String/Append"
NodeDefinition.prototype.description = "Concatenates three string inputs A, B, and C into a single output string."
NodeDefinition.prototype.portMeta = {
	inputs: {
		A: {"description":"Input \"A\" for Append.","structure":"Plain text string (UTF-8).","required":true},
		B: {"description":"Input \"B\" for Append.","structure":"Plain text string (UTF-8).","required":true},
		C: {"description":"Input \"C\" for Append.","structure":"Plain text string (UTF-8).","required":true},
	},
	outputs: {
		"": {"description":"Primary output of Append.","structure":"Plain text string (UTF-8).","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "add_comment"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([ string(params["A"]) + string(params["B"]) + string(params["C"])]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }