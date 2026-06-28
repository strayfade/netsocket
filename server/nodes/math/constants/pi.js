const { log, logColors } = require('../../../log')
const { number, string, bool } = require('../../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addOutput("Value", "number");
    }
}
NodeDefinition.prototype.title = "Math/Constants/Pi"
NodeDefinition.prototype.description = "Outputs the mathematical constant pi."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		Value: {"description":"Data value for the operation.","structure":"Value to store or compare.","mcpKey":"Value"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.bigText = "π"
NodeDefinition.prototype.title_mode = "LiteGraph.NO_TITLE"
NodeDefinition.prototype.collapsible = "false"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([Math.PI]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }