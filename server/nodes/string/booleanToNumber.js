const { bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Boolean", "boolean");
        this.addOutput("Number", "number");
    }
}
NodeDefinition.prototype.title = "String/Boolean To Number"
NodeDefinition.prototype.description = "Converts a boolean to 1 (true) or 0 (false)."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "convert_to_text"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([bool(params.Boolean) ? 1 : 0]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
