const { log, logColors } = require('../log')
const { number, string, bool } = require('../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addProperty("String", "abc");
        this.addInput("Regex", "string");
        this.addProperty("Regex", ".*");
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "String/Regex"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "regular_expression"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([new RegExp(string(params["Regex"])).test(string(params["String"]))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }