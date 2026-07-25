const { string, json } = require('../../utils/inputParser')
const { pluckArray } = require('../../utils/arrayTools')

class NodeDefinition {
    constructor() {
        this.addInput("Array", "array");
        this.addProperty("Array", "[]");
        this.addInput("Key", "string");
        this.addProperty("Key", "");
        this.addOutput("Result", "array");
    }
}
NodeDefinition.prototype.title = "JSON/Pluck"
NodeDefinition.prototype.description = "Maps an array of objects to an array of values for a given key."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "filter_list"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([pluckArray(json(params.Array), string(params.Key))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
