const { log, logColors } = require('../../log')
const { string } = require('../../utils/inputParser')
const { sendSignedWebhook } = require('../../utils/httpRequest')

require('../../manager/nodePreferencesRegistry').addPref(
    'Webhook',
    'notifiersWebhook.secret',
    'Outbound Webhook Secret',
    'text',
    '',
    'Optional secret used to sign outbound webhook payloads.'
)

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("URL", "string");
        this.addProperty("URL", "");
        this.addInput("Body", "string");
        this.addProperty("Body", "{}");
        this.addInput("Secret", "string");
        this.addProperty("Secret", "");
        this.addInput("Signature Header", "string");
        this.addProperty("Signature Header", "X-Netsocket-Signature");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Response", "string");
        this.addOutput("Status", "number");
    }
}
NodeDefinition.prototype.title = "Notifiers/Webhook Out"
NodeDefinition.prototype.description = "Sends an HTTP POST with a JSON body to a URL, optionally signing the payload with HMAC. Outputs the response body and HTTP status code."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		URL: {"description":"Request target URL.","structure":"HTTP or HTTPS URL string.","required":true},
		Body: {"description":"HTTP request payload.","structure":"Request body string (often JSON).","required":false},
		Secret: {"description":"Input \"Secret\" for Webhook Out.","structure":"Plain text string (UTF-8).","required":true},
		"Signature Header": {"description":"Input \"Signature Header\" for Webhook Out.","structure":"Plain text string (UTF-8).","required":false},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Response: {"description":"Primary text output.","structure":"Text response from the operation.","mcpKey":"Response"},
		Status: {"description":"Status produced by Webhook Out.","structure":"Numeric value (integer or float).","mcpKey":"Status"},
	},
}
NodeDefinition.prototype.color = "blue"
NodeDefinition.prototype.icon = "outbound"

const NodeFunction = async (node, params, behaviors) => {
    try {
        const settingsSecret = require('../../manager/settingsManager').getSetting('notifiersWebhook.secret')
        const secret = string(params.Secret) || settingsSecret
        const result = await sendSignedWebhook({
            url: params.URL,
            body: params.Body,
            secret,
            headerName: params["Signature Header"],
        })
        await behaviors.populateNextNodeLinks([null, result.body, result.status]);
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
        return true
    } catch (error) {
        log(`Webhook out failed: ${error.message}`, logColors.Error)
        await behaviors.populateNextNodeLinks([null, "", 0]);
        return false
    }
}

module.exports = { NodeDefinition, NodeFunction }
