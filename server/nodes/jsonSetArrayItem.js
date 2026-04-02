const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("JSON Array", "array");
        this.addInput("Index", "number")
        this.addInput("New Item", "string");
        this.addProperty("New Item", "{}");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("New Array", "array");
    }
}
NodeDefinition.prototype.title = "JSON/Set Array Item"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_array"
const NodeFunction = async (node, params, behaviors) => {
    try {
        let array = JSON.parse(string(params["JSON Array"]))
        const index = number(params.Index)
        const newItem = JSON.parse(string(params["New Item"]))
        if (index < array.length && index >= 0) {
            array[index] = newItem
            await behaviors.populateNextNodeLinks([JSON.stringify(array)]);
        }
    }
    catch (e) {
        log(`Error: ${e}`)
        return false
    }
    await behaviors.populateNextNodeLinks([JSON.stringify([])]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }