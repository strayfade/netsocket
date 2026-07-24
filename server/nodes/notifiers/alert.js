const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')
const { alert } = require('../../utils/alert')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Text", "string");
        this.addProperty("Text", "Alert");
        this.addInput("Conversation ID", "string");
        this.addInput("Device ID", "string");
        this.addOutput("", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Notifiers/Alert"
NodeDefinition.prototype.description = "Displays a user-facing alert notification with optional conversation ID and device ID routing. Blank Device ID sends the alert to all connected devices."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Text: {"description":"Input \"Text\" for Alert.","structure":"Plain text string (UTF-8).","required":false},
		"Conversation ID": {"description":"Input \"Conversation ID\" for Alert.","structure":"Plain text string (UTF-8).","required":false},
		"Device ID": {"description":"Optional target device ID. Blank sends the alert to all connected devices.","structure":"UUID string (8-4-4-4-12 hex), or empty for all devices.","required":false},
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
    const deviceId = string(params["Device ID"])
    log(
        `[Alert] ${text}${conversationId ? ` (conversation: ${conversationId})` : ""}${deviceId ? ` (device: ${deviceId})` : ""}`,
        logColors.Warning
    )
    await alert(text, conversationId, deviceId)
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }
