const { json } = require('../../utils/inputParser')
const { reverseArray } = require('../../utils/arrayTools')

class NodeDefinition {
    constructor() {
        this.addInput("Array", "array");
        this.addProperty("Array", "[]");
        this.addOutput("Result", "array");
    }
}
NodeDefinition.prototype.title = "JSON/Reverse Array"
NodeDefinition.prototype.description = "Returns a new array with elements in reverse order."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "swap_vert"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([reverseArray(json(params.Array))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
