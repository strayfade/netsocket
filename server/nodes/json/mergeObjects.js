const { json } = require('../../utils/inputParser')
const { mergeObjects } = require('../../utils/arrayTools')

class NodeDefinition {
    constructor() {
        this.addInput("A", "object");
        this.addProperty("A", "{}");
        this.addInput("B", "object");
        this.addProperty("B", "{}");
        this.addOutput("Result", "object");
    }
}
NodeDefinition.prototype.title = "JSON/Merge Objects"
NodeDefinition.prototype.description = "Shallow-merges two objects. Keys from B overwrite keys from A."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "merge"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([mergeObjects(json(params.A), json(params.B))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
