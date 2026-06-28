const { string } = require('../../utils/inputParser')
require('../../manager/nodePreferencesRegistry').addPref(
    'GitHub Webhook',
    'triggersGitHub.secret',
    'GitHub Webhook Secret Key',
    'text',
    '',
    'A secret key used to authenticate incoming GitHub webhooks.'
);

class NodeDefinition {
    constructor() {
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Event Type", "string")
        this.addOutput("Delivery ID", "string")
        this.addOutput("Repository", "string")
        this.addOutput("Action", "string")
        this.addOutput("Sender", "string")
        this.addOutput("Payload", "string")
    }
}
NodeDefinition.prototype.title = "Triggers/GitHub Webhook"
NodeDefinition.prototype.description = "Triggers when an authenticated GitHub webhook is received. Outputs event type, delivery ID, repository, action, sender, and full payload."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"Event Type": {"description":"Event Type produced by GitHub Webhook.","structure":"Plain text string (UTF-8).","mcpKey":"Event Type"},
		"Delivery ID": {"description":"Delivery ID produced by GitHub Webhook.","structure":"Plain text string (UTF-8).","mcpKey":"Delivery ID"},
		Repository: {"description":"Repository produced by GitHub Webhook.","structure":"Plain text string (UTF-8).","mcpKey":"Repository"},
		Action: {"description":"Action produced by GitHub Webhook.","structure":"Plain text string (UTF-8).","mcpKey":"Action"},
		Sender: {"description":"Sender produced by GitHub Webhook.","structure":"Plain text string (UTF-8).","mcpKey":"Sender"},
		Payload: {"description":"Payload produced by GitHub Webhook.","structure":"Plain text string (UTF-8).","mcpKey":"Payload"},
	},
}
NodeDefinition.prototype.color = "black"
NodeDefinition.prototype.icon = "data_object"

const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([
        null,
        string(params["Event Type"]),
        string(params["Delivery ID"]),
        string(params["Repository"]),
        string(params["Action"]),
        string(params["Sender"]),
        string(params["Payload"])
    ]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}

module.exports = { NodeDefinition, NodeFunction }
