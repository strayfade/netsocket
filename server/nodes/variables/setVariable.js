const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')
const { getVar, setVar } = require('../../utils/vars')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Name", "string")
        this.addInput("New Value", "string")
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Value", "string")
    }
}
NodeDefinition.prototype.title = "Variables/Set Variable"
NodeDefinition.prototype.description = "Writes a new value to a named global variable and outputs the stored value, persisting it for later reads."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Name: {"description":"Resource name to look up or update.","structure":"Human-readable name string.","required":true},
		"New Value": {"description":"Input \"New Value\" for Set Variable.","structure":"Plain text string (UTF-8).","required":true},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Value: {"description":"Data value for the operation.","structure":"Value to store or compare.","mcpKey":"Value"},
	},
}
NodeDefinition.prototype.color = "blue"
NodeDefinition.prototype.icon = "database_upload"
const NodeFunction = async (node, params, behaviors) => {
    setVar(string(params["Name"]), string(params["New Value"]))
    await behaviors.populateNextNodeLinks([getVar(string(params["Name"]))]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }