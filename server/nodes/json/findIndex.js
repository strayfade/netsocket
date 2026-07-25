const { string, json } = require('../../utils/inputParser')
const { findIndexInArray } = require('../../utils/arrayTools')

class NodeDefinition {
    constructor() {
        this.addInput("Array", "array");
        this.addProperty("Array", "[]");
        this.addInput("Key", "string");
        this.addProperty("Key", "");
        this.addInput("Value", "string");
        this.addProperty("Value", "");
        this.addOutput("Index", "number");
    }
}
NodeDefinition.prototype.title = "JSON/Find Index"
NodeDefinition.prototype.description = "Returns the index of the first array item matching a key/value pair, or -1 if none match."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "search"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([findIndexInArray(json(params.Array), string(params.Key), string(params.Value))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
