const { log, logColors } = require('../../../log')
const { number, string, bool } = require('../../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addInput("B", "number");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Trigonometry/atan2"
NodeDefinition.prototype.description = "Computes the angle in radians from the x-axis to the point (B, A) using Math.atan2."
NodeDefinition.prototype.portMeta = {
	inputs: {
		A: {"description":"Input \"A\" for atan2.","structure":"Numeric value (integer or float).","required":true},
		B: {"description":"Input \"B\" for atan2.","structure":"Numeric value (integer or float).","required":true},
	},
	outputs: {
		"": {"description":"Primary output of atan2.","structure":"Numeric value (integer or float).","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.bigText = "atan2"
NodeDefinition.prototype.title_mode = "LiteGraph.NO_TITLE"
NodeDefinition.prototype.collapsible = "false"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([
        Math.atan2(number(params.A), number(params.B))
    ]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }