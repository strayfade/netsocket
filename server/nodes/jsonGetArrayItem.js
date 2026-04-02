const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("JSON Array", "array");
        this.addInput("index", "number")
        this.addProperty("index", "0")
        this.addOutput("", "string");
    }
}
NodeDefinition.prototype.title = "JSON/Get Array Item"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_array"
const NodeFunction = async (node, params, behaviors) => {
    try {
        const array = JSON.parse(string(params["JSON Array"]))
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