const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Trigonometry/cos"
NodeDefinition.prototype.color = "green"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([Math.cos(number(params.A))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }