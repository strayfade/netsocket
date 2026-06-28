const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')
const { getVar, setVar } = require('../../utils/vars')

class NodeDefinition {
    constructor() {
        this.addProperty("Name", "")
        this.addOutput("Value", "string");
    }
}
NodeDefinition.prototype.title = "Variables/Get Variable"
NodeDefinition.prototype.description = "Reads a named global variable from server storage and outputs its string value."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		Value: {"description":"Data value for the operation.","structure":"Value to store or compare.","mcpKey":"Value"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "database"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([getVar(string(params["Name"]))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }