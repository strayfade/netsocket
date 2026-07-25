const { string, json } = require('../../utils/inputParser')
const { uniqueArray } = require('../../utils/arrayTools')

class NodeDefinition {
    constructor() {
        this.addInput("Array", "array");
        this.addProperty("Array", "[]");
        this.addInput("Key", "string");
        this.addProperty("Key", "");
        this.addOutput("Result", "array");
    }
}
NodeDefinition.prototype.title = "JSON/Unique"
NodeDefinition.prototype.description = "Removes duplicate values from an array, optionally comparing by an object key."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "filter_alt"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([uniqueArray(json(params.Array), string(params.Key))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
