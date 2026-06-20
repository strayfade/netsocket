const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Condition", "boolean");
        this.addEnumProperty("Condition", "False", ["True", "False"]);
        this.addOutput("True", LiteGraph.EVENT);
        this.addOutput("False", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.icon = "arrow_split"
NodeDefinition.prototype.title = "Flow Control/If"
NodeDefinition.prototype.description = "Routes execution to the True or False event output depending on whether the condition input is true."
NodeDefinition.prototype.color = "white"
const NodeFunction = async (node, params, behaviors) => {
    if (bool(params.Condition))
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    else
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[1]);
}
module.exports = { NodeDefinition, NodeFunction }