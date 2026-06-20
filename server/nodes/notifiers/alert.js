const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')
const { alert } = require('../../utils/alert')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Text", "string");
        this.addProperty("Text", "Alert");
        this.addInput("Conversation ID", "string");
        this.addOutput("", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Notifiers/Alert"
NodeDefinition.prototype.description = "Displays a user-facing alert notification with optional conversation ID routing. Sends the alert through the server's notification system."
NodeDefinition.prototype.color = "yellow"
NodeDefinition.prototype.icon = "notification_add"
const NodeFunction = async (node, params, behaviors) => {
    const text = string(params.Text)
    const conversationId = string(params["Conversation ID"])
    log(
        `[Alert] ${text}${conversationId ? ` (conversation: ${conversationId})` : ""}`,
        logColors.Warning
    )
    await alert(text, conversationId)
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }