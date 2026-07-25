const { string, json } = require('../../utils/inputParser')
const { findInArray } = require('../../utils/arrayTools')

class NodeDefinition {
    constructor() {
        this.addInput("Array", "array");
        this.addProperty("Array", "[]");
        this.addInput("Key", "string");
        this.addProperty("Key", "");
        this.addInput("Value", "string");
        this.addProperty("Value", "");
        this.addOutput("Item", "object");
    }
}
NodeDefinition.prototype.title = "JSON/Find"
NodeDefinition.prototype.description = "Finds the first array item matching a key/value pair, or null if none match."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "search"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([findInArray(json(params.Array), string(params.Key), string(params.Value))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
