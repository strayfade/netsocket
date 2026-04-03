const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addInput("B", "number");
        this.addInput("Alpha", "number");
        this.addProperty("Alpha", "0.5");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Interpolate"
NodeDefinition.prototype.color = "green"
const lerp = (a, b, alpha) => {
    return (b - a) * alpha + a
}
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([lerp(number(params.A), number(params.B), number(params.Alpha))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }