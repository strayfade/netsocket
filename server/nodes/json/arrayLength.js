const { log, logColors } = require('../../log')
const { number, string, bool, json } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Array", "array");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "JSON/Array Length"
NodeDefinition.prototype.description = "Returns the number of elements in a JSON array, or 0 if parsing fails."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_array"
const NodeFunction = async (node, params, behaviors) => {
    try {
        let array = json(params["Array"])
        await behaviors.populateNextNodeLinks([array.length]);
        return true
    }
    catch (e) {
        log(`Error: ${e}`)
        await behaviors.populateNextNodeLinks([ 0 ]);
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }