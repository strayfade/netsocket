const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addOutput("Value", "number");
        this.addProperty("Value", "0.0");
    }
}
NodeDefinition.prototype.title = "Constants/Float"
NodeDefinition.prototype.color = "green"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([number(params.Value)]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }