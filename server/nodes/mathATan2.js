const { number, string, bool } = require('./utils/inputParser')
class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addInput("B", "number");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Trigonometry/atan2"
NodeDefinition.prototype.color = "green"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([
        Math.atan2(number(params.A), number(params.B))
    ]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }