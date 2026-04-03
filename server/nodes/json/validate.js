const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("JSON", "string");
        this.addProperty("JSON", "{}");
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "JSON/Validate"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_object"
const NodeFunction = async (node, params, behaviors) => {
    try {
        JSON.parse(string(params.JSON))
        await behaviors.populateNextNodeLinks([true]);
        return true
    }
    catch {
        await behaviors.populateNextNodeLinks([false]);
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }