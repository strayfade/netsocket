const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "boolean");
        this.addInput("B", "boolean");
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "Logic/OR"
NodeDefinition.prototype.color = "green"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([bool(params.A) || bool(params.B)]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }