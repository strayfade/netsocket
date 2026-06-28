const { log, logColors } = require('../../log')
const { number, string, bool, json } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("JSON Array", "array");
        this.addInput("New Item", "string");
        this.addProperty("New Item", "{}");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("New Array", "array");
    }
}
NodeDefinition.prototype.title = "JSON/Push Array Item"
NodeDefinition.prototype.description = "Appends a new item to a JSON array and outputs the updated array as a JSON string."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"JSON Array": {"description":"Input \"JSON Array\" for Push Array Item.","structure":"JSON array (may be serialized as a string in some nodes).","required":true},
		"New Item": {"description":"Input \"New Item\" for Push Array Item.","structure":"Plain text string (UTF-8).","required":false},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"New Array": {"description":"New Array produced by Push Array Item.","structure":"JSON array (may be serialized as a string in some nodes).","mcpKey":"New Array"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_array"
const NodeFunction = async (node, params, behaviors) => {
    try {
        let array = json(params["JSON Array"])
        const newItem = json(params["New Item"])
        array.push(newItem)
        await behaviors.populateNextNodeLinks([JSON.stringify(array)]);
    }
    catch (e) {
        log(`Error: ${e}`)
        return false
    }
    await behaviors.populateNextNodeLinks([JSON.stringify([])]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }