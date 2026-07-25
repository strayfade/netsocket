const { string, json } = require('../../utils/inputParser')
const { sortArray } = require('../../utils/arrayTools')

class NodeDefinition {
    constructor() {
        this.addInput("Array", "array");
        this.addProperty("Array", "[]");
        this.addInput("Key", "string");
        this.addProperty("Key", "");
        this.addInput("Direction", "string");
        this.addEnumProperty("Direction", "asc", ["asc", "desc"]);
        this.addOutput("Result", "array");
    }
}
NodeDefinition.prototype.title = "JSON/Sort Array"
NodeDefinition.prototype.description = "Sorts a JSON array ascending or descending, optionally by an object key."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "sort"
const NodeFunction = async (node, params, behaviors) => {
    const result = sortArray(json(params.Array), string(params.Key), string(params.Direction));
    await behaviors.populateNextNodeLinks([result]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
