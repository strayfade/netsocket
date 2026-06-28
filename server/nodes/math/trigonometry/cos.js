const { log, logColors } = require('../../../log')
const { number, string, bool } = require('../../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Trigonometry/cos"
NodeDefinition.prototype.description = "Computes the cosine of A, where A is in radians."
NodeDefinition.prototype.portMeta = {
	inputs: {
		A: {"description":"Input \"A\" for cos.","structure":"Numeric value (integer or float).","required":true},
	},
	outputs: {
		"": {"description":"Primary output of cos.","structure":"Numeric value (integer or float).","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.bigText = "cos"
NodeDefinition.prototype.title_mode = "LiteGraph.NO_TITLE"
NodeDefinition.prototype.collapsible = "false"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([Math.cos(number(params.A))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }