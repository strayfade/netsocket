const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "boolean");
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "Logic/NOT"
NodeDefinition.prototype.color = "green"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([!bool(params.A)]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }