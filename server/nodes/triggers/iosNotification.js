const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')
require('../../manager/nodePreferencesRegistry').addPref(
    'iOS Notification',
    'triggersNotification.secret',
    'iOS Notification Secret Key',
    'text',
    '',
    'A secret key used to authenticate connections from the iOS tweak to netsocket.'
);
class NodeDefinition {
    constructor() {
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Title/Sender", "string")
        this.addOutput("Content", "string")
        this.addOutput("Bundle ID", "string")
    }
}
NodeDefinition.prototype.title = "Triggers/iOS Notification"
NodeDefinition.prototype.description = "Triggers when an authenticated iOS notification is forwarded to the server. Outputs title/sender, content, and bundle ID."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"Title/Sender": {"description":"Title/Sender produced by iOS Notification.","structure":"Plain text string (UTF-8).","mcpKey":"Title/Sender"},
		Content: {"description":"Content produced by iOS Notification.","structure":"Plain text string (UTF-8).","mcpKey":"Content"},
		"Bundle ID": {"description":"Bundle ID produced by iOS Notification.","structure":"Plain text string (UTF-8).","mcpKey":"Bundle ID"},
	},
}
NodeDefinition.prototype.color = "black"
NodeDefinition.prototype.icon = "notifications_unread"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([
        null,
        string(params["Title"]),
        string(params["Content"]),
        string(params["Bundle ID"])
    ]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }