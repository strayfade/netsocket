const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "boolean");
        this.addInput("B", "boolean");
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "Logic/AND"
NodeDefinition.prototype.description = "Outputs true only when both boolean inputs A and B are true."
NodeDefinition.prototype.portMeta = {
	inputs: {
		A: {"description":"Input \"A\" for AND.","structure":"Boolean true or false.","required":true},
		B: {"description":"Input \"B\" for AND.","structure":"Boolean true or false.","required":true},
	},
	outputs: {
		"": {"description":"Primary output of AND.","structure":"Boolean true or false.","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.bigText = "AND"
NodeDefinition.prototype.title_mode = "LiteGraph.NO_TITLE"
NodeDefinition.prototype.collapsible = "false"
NodeDefinition.prototype.icon = "join_inner"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([bool(params.A) && bool(params.B)]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }