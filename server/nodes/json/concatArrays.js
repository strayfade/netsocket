const { json } = require('../../utils/inputParser')
const { concatArrays } = require('../../utils/arrayTools')

class NodeDefinition {
    constructor() {
        this.addInput("A", "array");
        this.addProperty("A", "[]");
        this.addInput("B", "array");
        this.addProperty("B", "[]");
        this.addOutput("Result", "array");
    }
}
NodeDefinition.prototype.title = "JSON/Concat Arrays"
NodeDefinition.prototype.description = "Concatenates two JSON arrays into one."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "join_inner"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([concatArrays(json(params.A), json(params.B))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
