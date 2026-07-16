const { string } = require('../../utils/inputParser')
require('../../manager/nodePreferencesRegistry').addPref(
    'Notification Received',
    'triggersNotification.secret',
    'Notification Secret Key',
    'text',
    '',
    'A secret key used to authenticate mobile notification forwarders connecting to netsocket.'
);
class NodeDefinition {
    constructor() {
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Title/Sender", "string")
        this.addOutput("Content", "string")
        this.addOutput("Bundle ID", "string")
        this.addOutput("Device ID", "string")
    }
}
NodeDefinition.prototype.title = "Triggers/Notification Received"
NodeDefinition.prototype.description = "Triggers when an authenticated mobile notification is forwarded to the server. Outputs title/sender, content, bundle/package ID, and a stable on-device device ID."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"Title/Sender": {"description":"Title or sender of the received notification.","structure":"Plain text string (UTF-8).","mcpKey":"Title/Sender"},
		Content: {"description":"Body text of the received notification.","structure":"Plain text string (UTF-8).","mcpKey":"Content"},
		"Bundle ID": {"description":"App bundle ID (iOS) or package name (Android) that posted the notification.","structure":"Plain text string (UTF-8).","mcpKey":"Bundle ID"},
		"Device ID": {"description":"Stable UUID-format identifier for the forwarding device. Survives app reinstalls.","structure":"UUID string (8-4-4-4-12 hex).","mcpKey":"Device ID"},
	},
}
NodeDefinition.prototype.color = "black"
NodeDefinition.prototype.icon = "notifications_unread"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([
        null,
        string(params["Title"]),
        string(params["Content"]),
        string(params["Bundle ID"]),
        string(params["Device ID"])
    ]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }
