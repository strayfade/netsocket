const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Title/Sender", "string")
        this.addOutput("Content", "string")
        this.addOutput("Bundle ID", "string")
    }
}
NodeDefinition.prototype.title = "Triggers/iOS Notification"
NodeDefinition.prototype.color = "black"
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