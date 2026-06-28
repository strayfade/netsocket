const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Delay (ms)", "number");
        this.addProperty("Delay (ms)", "1000");
        this.addOutput("", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Flow Control/Delay"
NodeDefinition.prototype.description = "Pauses execution for the specified number of milliseconds before continuing on its event output."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"Delay (ms)": {"description":"Input \"Delay (ms)\" for Delay.","structure":"Numeric value (integer or float).","required":false},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "timer"
const NodeFunction = async (node, params, behaviors) => {
    await new Promise(resolve => setTimeout(resolve, number(params["Delay (ms)"])));
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }