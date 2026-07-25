const { string, number } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addInput("Index", "number");
        this.addProperty("Index", "0");
        this.addOutput("Char", "string");
    }
}
NodeDefinition.prototype.title = "String/Char At"
NodeDefinition.prototype.description = "Returns the character at the given index in a string."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "text_fields"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([string(params.String).charAt(Math.trunc(number(params.Index)))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
