const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addInput("B", "number");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Divide"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.bigText = "/"
const NodeFunction = async (node, params, behaviors) => {
    if (number(params.B) == 0) {
        log(`Attempted to divide by zero.`)
        return false
    }
    await behaviors.populateNextNodeLinks([number(params.A) / number(params.B)]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }