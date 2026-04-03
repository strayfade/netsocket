const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("JSON Array", "array");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "JSON/Array Length"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_array"
const NodeFunction = async (node, params, behaviors) => {
    try {
        let array = JSON.parse(string(params["JSON Array"]))
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