const { isEmptyValue } = require('../../utils/stringTools')

class NodeDefinition {
    constructor() {
        this.addInput("Value", "object");
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "Logic/Is Empty"
NodeDefinition.prototype.description = "Outputs true if the value is null, empty string, empty array, or empty object."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "check_box_outline_blank"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([isEmptyValue(params.Value)]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
