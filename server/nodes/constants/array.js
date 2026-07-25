const { json } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addOutput("Value", "array");
        this.addProperty("Value", "[]");
    }
}
NodeDefinition.prototype.title = "Constants/Array"
NodeDefinition.prototype.description = "Outputs a fixed JSON array configured in the node property."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_array"
const NodeFunction = async (node, params, behaviors) => {
    const value = json(params.Value);
    await behaviors.populateNextNodeLinks([Array.isArray(value) ? value : []]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
