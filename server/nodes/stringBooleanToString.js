const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Boolean", "boolean");
        this.addOutput("String", "string");
    }
}
NodeDefinition.prototype.title = "String/To String (boolean)"
NodeDefinition.prototype.color = "green"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([bool(params.Boolean) ? "true" : "false"]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }