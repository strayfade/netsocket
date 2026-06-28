const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Natural Log"
NodeDefinition.prototype.description = "Computes the natural logarithm of A."
NodeDefinition.prototype.portMeta = {
	inputs: {
		A: {"description":"Input \"A\" for Natural Log.","structure":"Numeric value (integer or float).","required":true},
	},
	outputs: {
		"": {"description":"Primary output of Natural Log.","structure":"Numeric value (integer or float).","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.bigText = "ln"
NodeDefinition.prototype.title_mode = "LiteGraph.NO_TITLE"
NodeDefinition.prototype.collapsible = "false"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([ Math.log(number(params.A)) / Math.log(Math.E) ]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }