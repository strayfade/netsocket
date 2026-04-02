const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addInput("Min", "number");
        this.addInput("Max", "number");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Clamp"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "arrow_range"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([(number(params.A) < number(params.Min) ? number(params.Min) : (number(params.A) > number(params.Max) ? number(params.Max) : number(params.A)))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }