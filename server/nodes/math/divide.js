const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addInput("B", "number");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Divide"
NodeDefinition.prototype.description = "Divides A by B and outputs the quotient, failing if B is zero."
NodeDefinition.prototype.portMeta = {
	inputs: {
		A: {"description":"Input \"A\" for Divide.","structure":"Numeric value (integer or float).","required":true},
		B: {"description":"Input \"B\" for Divide.","structure":"Numeric value (integer or float).","required":true},
	},
	outputs: {
		"": {"description":"Primary output of Divide.","structure":"Numeric value (integer or float).","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.bigText = "/"
NodeDefinition.prototype.title_mode = "LiteGraph.NO_TITLE"
NodeDefinition.prototype.collapsible = "false"
const NodeFunction = async (node, params, behaviors) => {
    if (number(params.B) == 0) {
        log(`Attempted to divide by zero.`)
        return false
    }
    await behaviors.populateNextNodeLinks([number(params.A) / number(params.B)]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }