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
NodeDefinition.prototype.title = "Triggers/Gmail New Email"
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
