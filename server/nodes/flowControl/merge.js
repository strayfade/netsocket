class NodeDefinition {
    constructor() {
        this.addInput("A", LiteGraph.EVENT);
        this.addInput("B", LiteGraph.EVENT);
        this.addInput("C", LiteGraph.EVENT);
        this.addOutput("", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Flow Control/Merge"
NodeDefinition.prototype.description = "Merges up to three event inputs into a single event output. Fires whenever any input triggers."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "merge"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0] || []);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
