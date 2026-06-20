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
