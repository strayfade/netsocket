const { log } = require('../../log')
const { json } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Array", "array");
        this.addOutput("String", "string");
    }
}
NodeDefinition.prototype.title = "String/To String (array)"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "convert_to_text"
const NodeFunction = async (node, params, behaviors) => {
    try {
        const arr = json(params["Array"])
        await behaviors.populateNextNodeLinks([JSON.stringify(arr)]);
        return true
    }
    catch (e) {
        log(`Error: ${e}`)
        await behaviors.populateNextNodeLinks(["[]"]);
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }
