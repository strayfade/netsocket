const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')
const { alert } = require('../../utils/alert')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Text", "string");
        this.addProperty("Text", "Alert");
        this.addInput("Conversation ID", "string");
        this.addOutput("", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Notifiers/Alert"
NodeDefinition.prototype.description = "Displays a user-facing alert notification with optional conversation ID routing. Sends the alert through the server's notification system."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Text: {"description":"Input \"Text\" for Alert.","structure":"Plain text string (UTF-8).","required":false},
		"Conversation ID": {"description":"Input \"Conversation ID\" for Alert.","structure":"Plain text string (UTF-8).","required":true},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
	},
}
NodeDefinition.prototype.color = "yellow"
NodeDefinition.prototype.icon = "notification_add"
const NodeFunction = async (node, params, behaviors) => {
    const text = string(params.Text)
    const conversationId = string(params["Conversation ID"])
    log(
        `[Alert] ${text}${conversationId ? ` (conversation: ${conversationId})` : ""}`,
        logColors.Warning
    )
    await alert(text, conversationId)
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }