const { log, logColors } = require('../log')
const { number, string, bool } = require('../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "string");
        this.addInput("B", "string");
        this.addInput("C", "string");
        this.addOutput("", "string");
    }
}
NodeDefinition.prototype.title = "String/Append"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "add_comment"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([ string(params["A"]) + string(params["B"]) + string(params["C"])]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }