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
