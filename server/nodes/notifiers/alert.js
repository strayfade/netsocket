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
        this.addInput("Exclude Device", "boolean");
        this.addEnumProperty("Exclude Device", "False", ["True", "False"]);
        this.addOutput("", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Notifiers/Alert"
NodeDefinition.prototype.description = "Displays a user-facing alert notification with optional conversation ID and device ID routing. Blank Device ID sends the alert to all connected devices. Exclude Device inverts that routing: the alert goes to every connected device except the one named in Device ID."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Text: {"description":"Input \"Text\" for Alert.","structure":"Plain text string (UTF-8).","required":false},
		"Conversation ID": {"description":"Input \"Conversation ID\" for Alert.","structure":"Plain text string (UTF-8).","required":false},
		"Device ID": {"description":"Optional target device ID. Blank sends the alert to all connected devices. With Exclude Device true, this names the device to skip.","structure":"UUID string (8-4-4-4-12 hex), or empty for all devices.","required":false},
		"Exclude Device": {"description":"When true, sends the alert to every connected device except the one named in Device ID. Ignored when Device ID is blank or a Conversation ID routes the alert.","structure":"Boolean true or false.","required":false},
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
    const excludeDevice = bool(params["Exclude Device"])
    log(
        `[Alert] ${text}${conversationId ? ` (conversation: ${conversationId})` : ""}${deviceId ? ` (${excludeDevice ? "except device" : "device"}: ${deviceId})` : ""}`,
        logColors.Warning
    )
    await alert(text, conversationId, deviceId, excludeDevice)
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }
