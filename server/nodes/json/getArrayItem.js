const { log, logColors } = require('../../log')
const { number, string, bool, json } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Array", "array");
        this.addInput("index", "number")
        this.addProperty("index", "0")
        this.addOutput("", "object");
    }
}
NodeDefinition.prototype.title = "JSON/Get Array Item"
NodeDefinition.prototype.description = "Returns the element at a given index from a JSON array as a JSON string, or an empty object if the index is out of range."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_array"
const NodeFunction = async (node, params, behaviors) => {
    try {
        const array = json(params["Array"])
        const index = number(params.index)
        if (index < array.length && index >= 0)
            await behaviors.populateNextNodeLinks([JSON.stringify(array[index])]);
        else
            await behaviors.populateNextNodeLinks(["{}"]);
        return true
    }
    catch {
        await behaviors.populateNextNodeLinks(["{}"]);
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }