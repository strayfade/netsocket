class NodeDefinition {
    constructor() {
        this.addInput("Value", "object");
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "Logic/Is Null"
NodeDefinition.prototype.description = "Outputs true if the value is null or undefined."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "block"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([params.Value == null]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
