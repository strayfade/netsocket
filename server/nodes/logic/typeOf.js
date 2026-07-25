const { typeOfValue } = require('../../utils/stringTools')

class NodeDefinition {
    constructor() {
        this.addInput("Value", "object");
        this.addOutput("Type", "string");
    }
}
NodeDefinition.prototype.title = "Logic/Type Of"
NodeDefinition.prototype.description = "Outputs the runtime type of a value as a string (string, number, boolean, object, array, null, etc.)."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "category"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([typeOfValue(params.Value)]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
