const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Loop Count", "number");
        this.addProperty("Loop Count", "3");
        this.addInput("Delay (ms)", "number");
        this.addOutput("On Loop", LiteGraph.EVENT);
        this.addOutput("Index", "number")
        this.addOutput("On Finish", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Flow Control/For"
NodeDefinition.prototype.description = "Repeats a loop a fixed number of times, firing the On Loop output with the current index each iteration and optionally waiting between iterations. Fires On Finish when all iterations complete."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"Loop Count": {"description":"Input \"Loop Count\" for For.","structure":"Numeric value (integer or float).","required":false},
		"Delay (ms)": {"description":"Input \"Delay (ms)\" for For.","structure":"Numeric value (integer or float).","required":true},
	},
	outputs: {
		"On Loop": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Index: {"description":"Index produced by For.","structure":"Numeric value (integer or float).","mcpKey":"Index"},
		"On Finish": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "cached"
const NodeFunction = async (node, params, behaviors) => {
    for (let i = 0; i < number(params["Loop Count"]); i++) {
        await behaviors.populateNextNodeLinks([
            null, i, null
        ]);
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
        if (i < number(params["Loop Count"]) - 1)
            await new Promise(resolve => setTimeout(resolve, number(params["Delay (ms)"])));
    }
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[2]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }