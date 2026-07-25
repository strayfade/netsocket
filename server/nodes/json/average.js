const { string, json } = require('../../utils/inputParser')
const { averageArray } = require('../../utils/arrayTools')

class NodeDefinition {
    constructor() {
        this.addInput("Array", "array");
        this.addProperty("Array", "[]");
        this.addInput("Key", "string");
        this.addProperty("Key", "");
        this.addOutput("Average", "number");
    }
}
NodeDefinition.prototype.title = "JSON/Average"
NodeDefinition.prototype.description = "Averages numeric values in an array, optionally reading each value from an object key."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "functions"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([averageArray(json(params.Array), string(params.Key))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
