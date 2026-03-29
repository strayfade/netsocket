const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')
const { alert } = require('./utils/alert')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Text", "string");
        this.addProperty("Text", "Alert");
        this.addOutput("", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Notifiers/Alert"
NodeDefinition.prototype.color = "yellow"
const NodeFunction = async (node, params, behaviors) => {
    await alert(string(params.Text))
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }