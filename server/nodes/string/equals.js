const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "string");
        this.addInput("B", "string");
        this.addInput("Case-sensitive", "boolean");
        this.addEnumProperty("Case-sensitive", "True", ["True", "False"]);
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "String/Equals"
NodeDefinition.prototype.description = "Compares two strings for equality with optional case sensitivity and outputs \"true\" or \"false\" as a string."
NodeDefinition.prototype.portMeta = {
	inputs: {
		A: {"description":"Input \"A\" for Equals.","structure":"Plain text string (UTF-8).","required":true},
		B: {"description":"Input \"B\" for Equals.","structure":"Plain text string (UTF-8).","required":true},
		"Case-sensitive": {"description":"Input \"Case-sensitive\" for Equals.","structure":"Boolean true or false.","required":false},
	},
	outputs: {
		"": {"description":"Primary output of Equals.","structure":"Boolean true or false.","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.bigText = "="
NodeDefinition.prototype.icon = "calculate"
const NodeFunction = async (node, params, behaviors) => {
    params.A = string(params.A)
    params.B = string(params.B)
    let caseSensitive = bool(params["Case-sensitive"])
    let output = (caseSensitive ? (params.A == params.B) : (params.A.toLowerCase() == params.B.toLowerCase())) ? "true" : "false"
    await behaviors.populateNextNodeLinks([output]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }