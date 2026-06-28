const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addOutput("Value", "string");
        this.addProperty("Value", "");
    }
}
NodeDefinition.prototype.title = "Constants/String"
NodeDefinition.prototype.description = "Outputs a fixed text value configured in the node property."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		Value: {"description":"Data value for the operation.","structure":"Value to store or compare.","mcpKey":"Value"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "input"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([string(params.Value)]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }