const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Condition", "boolean");
        this.addProperty("Condition", "false");
        this.addOutput("True", LiteGraph.EVENT);
        this.addOutput("False", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.icon = "arrow_split"
NodeDefinition.prototype.title = "Flow Control/If"
NodeDefinition.prototype.color = "white"
const NodeFunction = async (node, params, behaviors) => {
    if (bool(params.Condition))
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    else
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[1]);
}
module.exports = { NodeDefinition, NodeFunction }