const { string, json } = require('../../utils/inputParser')
const { sumArray } = require('../../utils/arrayTools')

class NodeDefinition {
    constructor() {
        this.addInput("Array", "array");
        this.addProperty("Array", "[]");
        this.addInput("Key", "string");
        this.addProperty("Key", "");
        this.addOutput("Sum", "number");
    }
}
NodeDefinition.prototype.title = "JSON/Sum"
NodeDefinition.prototype.description = "Sums numeric values in an array, optionally reading each value from an object key."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "functions"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([sumArray(json(params.Array), string(params.Key))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
