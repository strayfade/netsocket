const { json } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addOutput("Value", "JSON");
        this.addProperty("Value", "{}");
    }
}
NodeDefinition.prototype.title = "Constants/JSON"
NodeDefinition.prototype.description = "Outputs a fixed JSON value configured in the node property."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_object"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([json(params.Value)]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
