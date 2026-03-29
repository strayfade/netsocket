const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addOutput("Value", "boolean");
        this.addProperty("Value", "false");
    }
}
NodeDefinition.prototype.title = "Constants/Boolean"
NodeDefinition.prototype.color = "green"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([bool(params.Value)]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }