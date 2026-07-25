const { number, json } = require('../../utils/inputParser')
const { sliceArray } = require('../../utils/arrayTools')

class NodeDefinition {
    constructor() {
        this.addInput("Array", "array");
        this.addProperty("Array", "[]");
        this.addInput("Begin", "number");
        this.addProperty("Begin", "0");
        this.addInput("End", "number");
        this.addProperty("End", "");
        this.addOutput("Result", "array");
    }
}
NodeDefinition.prototype.title = "JSON/Slice Array"
NodeDefinition.prototype.description = "Returns a slice of a JSON array from Begin inclusive to End exclusive."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "content_cut"
const NodeFunction = async (node, params, behaviors) => {
    const endRaw = params.End;
    const end = endRaw === "" || endRaw == null ? undefined : number(endRaw);
    await behaviors.populateNextNodeLinks([sliceArray(json(params.Array), number(params.Begin), end)]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
