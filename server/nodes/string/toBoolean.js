const { bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Value", "string");
        this.addOutput("Boolean", "boolean");
    }
}
NodeDefinition.prototype.title = "String/To Boolean"
NodeDefinition.prototype.description = "Converts common truthy/falsy string and numeric values into a boolean."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "toggle_on"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([bool(params.Value)]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
