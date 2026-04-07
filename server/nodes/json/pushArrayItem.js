const { log, logColors } = require('../../log')
const { number, string, bool, json } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("JSON Array", "array");
        this.addInput("New Item", "string");
        this.addProperty("New Item", "{}");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("New Array", "array");
    }
}
NodeDefinition.prototype.title = "JSON/Push Array Item"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_array"
const NodeFunction = async (node, params, behaviors) => {
    try {
        let array = json(params["JSON Array"])
        const newItem = json(params["New Item"])
        array.push(newItem)
        await behaviors.populateNextNodeLinks([JSON.stringify(array)]);
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