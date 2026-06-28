const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Delay (ms)", "number");
        this.addOutput("1", LiteGraph.EVENT);
        this.addOutput("2", LiteGraph.EVENT);
        this.addOutput("3", LiteGraph.EVENT);
        this.addOutput("4", LiteGraph.EVENT);
        this.addOutput("5", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Flow Control/Sequence"
NodeDefinition.prototype.description = "Fires five sequential event outputs in order, waiting a configurable delay between each step."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"Delay (ms)": {"description":"Input \"Delay (ms)\" for Sequence.","structure":"Numeric value (integer or float).","required":true},
	},
	outputs: {
		"1": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"2": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"3": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"4": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"5": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "order_play"
const NodeFunction = async (node, params, behaviors) => {
    for (i in [0, 1, 2, 3, 4]) {
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[i]);
        await new Promise(resolve => setTimeout(resolve, number(params["Delay (ms)"])));
    }
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[3]);
}
module.exports = { NodeDefinition, NodeFunction }