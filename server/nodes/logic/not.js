const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "boolean");
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "Logic/NOT"
NodeDefinition.prototype.description = "Outputs the logical negation of boolean input A."
NodeDefinition.prototype.portMeta = {
	inputs: {
		A: {"description":"Input \"A\" for NOT.","structure":"Boolean true or false.","required":true},
	},
	outputs: {
		"": {"description":"Primary output of NOT.","structure":"Boolean true or false.","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.bigText = "NOT"
NodeDefinition.prototype.title_mode = "LiteGraph.NO_TITLE"
NodeDefinition.prototype.collapsible = "false"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([!bool(params.A)]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }