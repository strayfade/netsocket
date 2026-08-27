const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')
const { getVar, setVar } = require('../../utils/vars')

class NodeDefinition {
    constructor() {
        this.addInput("Name", "string")
        this.addProperty("Name", "")
        this.addOutput("Value", "string");
    }
}
NodeDefinition.prototype.title = "Variables/Get Variable"
NodeDefinition.prototype.description = "Reads a named global variable from server storage and outputs its string value."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Name: {"description":"Variable name to read — can be chained from List Variables or prior outputs.","structure":"Human-readable name string (e.g. from Variables/List Variables). Falls back to property Name if not linked.","required":true},
	},
	outputs: {
		Value: {"description":"Current string value of the variable (empty string if not set).","structure":"Value to store or compare.","mcpKey":"Value"},
	},
}
NodeDefinition.prototype.mcpPreferred = "Prefer for reading a stored variable by name; input Name can be chained from Variables/List Variables. For writing, use Variables/Set Variable."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "database"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([getVar(string(params["Name"]))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }