const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addInput("Exponent", "number");
        this.addProperty("Exponent", "2");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Exponent"
NodeDefinition.prototype.description = "Raises A to the power of the Exponent input and outputs the result."
NodeDefinition.prototype.portMeta = {
	inputs: {
		A: {"description":"Input \"A\" for Exponent.","structure":"Numeric value (integer or float).","required":true},
		Exponent: {"description":"Input \"Exponent\" for Exponent.","structure":"Numeric value (integer or float).","required":false},
	},
	outputs: {
		"": {"description":"Primary output of Exponent.","structure":"Numeric value (integer or float).","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.bigText = "^"
NodeDefinition.prototype.title_mode = "LiteGraph.NO_TITLE"
NodeDefinition.prototype.collapsible = "false"
NodeDefinition.prototype.icon = "superscript"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([Math.pow(number(params.A), number(params.Exponent))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }