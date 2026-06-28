const { log, logColors } = require('../../log')
const { number, string, bool, json } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Array", "array");
        this.addInput("Delay (ms)", "number");
        this.addOutput("On Element", LiteGraph.EVENT);
        this.addOutput("Element", "object")
        this.addOutput("Index", "number")
        this.addOutput("On Finish", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Flow Control/For Each"
NodeDefinition.prototype.description = "Iterates over a JSON array, firing On Element with each item as a JSON object and its index, then fires On Finish when done."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Array: {"description":"Input \"Array\" for For Each.","structure":"JSON array (may be serialized as a string in some nodes).","required":true},
		"Delay (ms)": {"description":"Input \"Delay (ms)\" for For Each.","structure":"Numeric value (integer or float).","required":true},
	},
	outputs: {
		"On Element": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Element: {"description":"Element produced by For Each.","structure":"JSON object (may be serialized as a string in some nodes).","mcpKey":"Element"},
		Index: {"description":"Index produced by For Each.","structure":"Numeric value (integer or float).","mcpKey":"Index"},
		"On Finish": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "data_array"
const NodeFunction = async (node, params, behaviors) => {
    try {
        const array = json(params.Array)
        if (!Array.isArray(array))
            throw new Error('Array input must be a JSON array')
        for (let i = 0; i < array.length; i++) {
            const currentElement = array[i]
            await behaviors.populateNextNodeLinks([
                null, currentElement, i, null
            ]);
            await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
            if (i < array.length - 1)
                await new Promise(resolve => setTimeout(resolve, number(params["Delay (ms)"])));
        }
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[3]);
    }
    catch (e) {
        log(`Error: ${e}`, logColors.Error)
        return false
    }
    return true
}
module.exports = { NodeDefinition, NodeFunction }