const { number } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Trunc"
NodeDefinition.prototype.description = "Truncates the fractional part of a number toward zero."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "cut"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([Math.trunc(number(params.A))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
