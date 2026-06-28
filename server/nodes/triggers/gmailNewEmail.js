const { string } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("From", "string")
        this.addOutput("Subject", "string")
        this.addOutput("Snippet", "string")
        this.addOutput("Message ID", "string")
        this.addOutput("Thread ID", "string")
        this.addOutput("Payload", "string")
    }
}
NodeDefinition.prototype.title = "Triggers/New Email (Gmail)"
NodeDefinition.prototype.description = "Triggers when a new Gmail message is detected via Google polling. Outputs sender, subject, snippet, message ID, thread ID, and full payload."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		From: {"description":"From produced by New Email (Gmail).","structure":"Plain text string (UTF-8).","mcpKey":"From"},
		Subject: {"description":"Message subject.","structure":"Email subject line.","mcpKey":"Subject"},
		Snippet: {"description":"Snippet produced by New Email (Gmail).","structure":"Plain text string (UTF-8).","mcpKey":"Snippet"},
		"Message ID": {"description":"Message ID produced by New Email (Gmail).","structure":"Plain text string (UTF-8).","mcpKey":"Message ID"},
		"Thread ID": {"description":"Thread ID produced by New Email (Gmail).","structure":"Plain text string (UTF-8).","mcpKey":"Thread ID"},
		Payload: {"description":"Payload produced by New Email (Gmail).","structure":"Plain text string (UTF-8).","mcpKey":"Payload"},
	},
}
NodeDefinition.prototype.color = "black"
NodeDefinition.prototype.icon = "mail"

const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([
        null,
        string(params["From"]),
        string(params["Subject"]),
        string(params["Snippet"]),
        string(params["Message ID"]),
        string(params["Thread ID"]),
        string(params["Payload"])
    ]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}

module.exports = { NodeDefinition, NodeFunction }
