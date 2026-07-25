const { number } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Ceil"
NodeDefinition.prototype.description = "Rounds a number up to the nearest integer."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "arrow_upward"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([Math.ceil(number(params.A))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
