const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "boolean");
        this.addInput("B", "boolean");
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "Logic/XOR"
NodeDefinition.prototype.description = "Outputs true when exactly one of boolean inputs A or B is true."
NodeDefinition.prototype.portMeta = {
	inputs: {
		A: {"description":"Input \"A\" for XOR.","structure":"Boolean true or false.","required":true},
		B: {"description":"Input \"B\" for XOR.","structure":"Boolean true or false.","required":true},
	},
	outputs: {
		"": {"description":"Primary output of XOR.","structure":"Boolean true or false.","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.bigText = "XOR"
NodeDefinition.prototype.title_mode = "LiteGraph.NO_TITLE"
NodeDefinition.prototype.collapsible = "false"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([bool(params.A) != bool(params.B)]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }