const { string, json } = require('../../utils/inputParser')
const { joinArray } = require('../../utils/stringTools')

class NodeDefinition {
    constructor() {
        this.addInput("Array", "array");
        this.addProperty("Array", "[]");
        this.addInput("Delimiter", "string");
        this.addProperty("Delimiter", ",");
        this.addOutput("Text", "string");
    }
}
NodeDefinition.prototype.title = "String/Join"
NodeDefinition.prototype.description = "Joins array elements into a single string using a delimiter (inverse of Split)."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "join"
const NodeFunction = async (node, params, behaviors) => {
    const items = json(params.Array);
    await behaviors.populateNextNodeLinks([joinArray(items, string(params.Delimiter))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
