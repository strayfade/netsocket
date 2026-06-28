const { string } = require('../../utils/inputParser')
require('../../manager/nodePreferencesRegistry').addPref(
    'Webhook',
    'triggersWebhook.secret',
    'Webhook Secret Key',
    'text',
    '',
    'A secret key used to authenticate incoming generic webhooks.'
);

class NodeDefinition {
    constructor() {
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Method", "string")
        this.addOutput("Path", "string")
        this.addOutput("Query", "string")
        this.addOutput("Headers", "string")
        this.addOutput("Body", "string")
    }
}
NodeDefinition.prototype.title = "Triggers/Webhook"
NodeDefinition.prototype.description = "Triggers when an authenticated generic HTTP webhook is received. Outputs the request method, path, query, headers, and body."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Method: {"description":"HTTP verb to use.","structure":"HTTP method name such as GET or POST.","mcpKey":"Method"},
		Path: {"description":"HTTP path segment.","structure":"URL path or route string.","mcpKey":"Path"},
		Query: {"description":"Web search query text.","structure":"Search query string.","mcpKey":"Query"},
		Headers: {"description":"Optional HTTP request headers.","structure":"JSON object of HTTP header names to values.","mcpKey":"Headers"},
		Body: {"description":"HTTP request payload.","structure":"Request body string (often JSON).","mcpKey":"Body"},
	},
}
NodeDefinition.prototype.color = "black"
NodeDefinition.prototype.icon = "webhook"

const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([
        null,
        string(params["Method"]),
        string(params["Path"]),
        string(params["Query"]),
        string(params["Headers"]),
        string(params["Body"])
    ]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}

module.exports = { NodeDefinition, NodeFunction }
