const { number, string, bool } = require('../../utils/inputParser')
const { checkThrottle } = require('../../utils/throttleState')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Key", "string");
        this.addProperty("Key", "default");
        this.addInput("Max Executions", "number");
        this.addProperty("Max Executions", "5");
        this.addInput("Window (ms)", "number");
        this.addProperty("Window (ms)", "60000");
        this.addOutput("Allowed", LiteGraph.EVENT);
        this.addOutput("Throttled", LiteGraph.EVENT);
        this.addOutput("Count", "number");
    }
}
NodeDefinition.prototype.title = "Flow Control/Throttle"
NodeDefinition.prototype.description = "Rate-limits execution by key within a time window, routing to Allowed or Throttled and outputting the current execution count."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Key: {"description":"Key used for lookup or assignment.","structure":"Object key or lookup key string.","required":false},
		"Max Executions": {"description":"Input \"Max Executions\" for Throttle.","structure":"Numeric value (integer or float).","required":false},
		"Window (ms)": {"description":"Input \"Window (ms)\" for Throttle.","structure":"Numeric value (integer or float).","required":false},
	},
	outputs: {
		Allowed: {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Throttled: {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Count: {"description":"Count produced by Throttle.","structure":"Numeric value (integer or float).","mcpKey":"Count"},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "speed"

const NodeFunction = async (node, params, behaviors) => {
    const result = checkThrottle(
        string(params.Key),
        number(params["Max Executions"]),
        number(params["Window (ms)"])
    )

    await behaviors.populateNextNodeLinks([null, null, result.count]);

    if (result.allowed) {
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    } else {
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[1]);
    }

    return true
}

module.exports = { NodeDefinition, NodeFunction }
