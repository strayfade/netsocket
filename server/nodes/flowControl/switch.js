const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);

        this.addInput("Input", "string");

        this.addInput("Condition 1", "string");
        this.addProperty("Condition 1", "match1")
        this.addInput("Condition 2", "string");
        this.addProperty("Condition 2", "match2")
        this.addInput("Condition 3", "string");
        this.addProperty("Condition 3", "match3")
        this.addInput("Condition 4", "string");
        this.addProperty("Condition 4", "match4")
        this.addInput("Condition 5", "string");
        this.addProperty("Condition 5", "match5")

        this.addOutput("1", LiteGraph.EVENT);
        this.addOutput("2", LiteGraph.EVENT);
        this.addOutput("3", LiteGraph.EVENT);
        this.addOutput("4", LiteGraph.EVENT);
        this.addOutput("5", LiteGraph.EVENT);
        this.addOutput("Default", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Flow Control/Switch"
NodeDefinition.prototype.description = "Compares an input string against up to five condition values and routes execution to the matching output, or to Default if none match."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Input: {"description":"Input \"Input\" for Switch.","structure":"Plain text string (UTF-8).","required":true},
		"Condition 1": {"description":"Input \"Condition 1\" for Switch.","structure":"Plain text string (UTF-8).","required":false},
		"Condition 2": {"description":"Input \"Condition 2\" for Switch.","structure":"Plain text string (UTF-8).","required":false},
		"Condition 3": {"description":"Input \"Condition 3\" for Switch.","structure":"Plain text string (UTF-8).","required":false},
		"Condition 4": {"description":"Input \"Condition 4\" for Switch.","structure":"Plain text string (UTF-8).","required":false},
		"Condition 5": {"description":"Input \"Condition 5\" for Switch.","structure":"Plain text string (UTF-8).","required":false},
	},
	outputs: {
		"1": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"2": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"3": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"4": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"5": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Default: {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "arrow_split"
const NodeFunction = async (node, params, behaviors) => {
    let matched = false;
    for (i in [0, 1, 2, 3, 4]) {
        if (string(params.Input) == string(params[`Condition ${(parseInt(i) + 1).toString()}`])) {
            matched = true;
            await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[i]);
        }
    }
    if (!matched)
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[5]);
}
module.exports = { NodeDefinition, NodeFunction }