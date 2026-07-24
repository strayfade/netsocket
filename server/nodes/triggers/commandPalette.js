const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')
class NodeDefinition {
    constructor() {
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Content", "string")
        this.addOutput("Conversation ID", "string")
        this.addOutput("Device ID", "string")
    }
}
NodeDefinition.prototype.title = "Triggers/Command Palette"
NodeDefinition.prototype.description = "Triggers when a command is received from the authenticated command palette integration. Outputs the command content, conversation ID, and originating device ID."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Content: {"description":"Content produced by Command Palette.","structure":"Plain text string (UTF-8).","mcpKey":"Content"},
		"Conversation ID": {"description":"Conversation ID produced by Command Palette.","structure":"Plain text string (UTF-8).","mcpKey":"Conversation ID"},
		"Device ID": {"description":"Stable device identifier of the client that sent the command.","structure":"UUID string (8-4-4-4-12 hex), or empty when not provided.","mcpKey":"Device ID"},
	},
}
NodeDefinition.prototype.color = "black"
NodeDefinition.prototype.icon = "input"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([
        null,
        string(params["Content"]),
        string(params["Conversation ID"]),
        string(params["Device ID"])
    ]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }
