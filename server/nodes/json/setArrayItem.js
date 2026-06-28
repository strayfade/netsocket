const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Array", "array");
        this.addInput("Index", "number")
        this.addInput("New Item", "string");
        this.addProperty("New Item", "{}");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("New Array", "array");
    }
}
NodeDefinition.prototype.title = "JSON/Set Array Item"
NodeDefinition.prototype.description = "Replaces the element at a given index in a JSON array and outputs the updated array as a JSON string."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Array: {"description":"Input \"Array\" for Set Array Item.","structure":"JSON array (may be serialized as a string in some nodes).","required":true},
		Index: {"description":"Input \"Index\" for Set Array Item.","structure":"Numeric value (integer or float).","required":true},
		"New Item": {"description":"Input \"New Item\" for Set Array Item.","structure":"Plain text string (UTF-8).","required":false},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"New Array": {"description":"New Array produced by Set Array Item.","structure":"JSON array (may be serialized as a string in some nodes).","mcpKey":"New Array"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_array"
const NodeFunction = async (node, params, behaviors) => {
    try {
        let array = json(params["Array"])
        const index = number(params.Index)
        const newItem = json(params["New Item"])
        if (index < array.length && index >= 0) {
            array[index] = newItem
            await behaviors.populateNextNodeLinks([JSON.stringify(array)]);
        }
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