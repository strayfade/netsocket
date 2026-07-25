const { number } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Floor"
NodeDefinition.prototype.description = "Rounds a number down to the nearest integer."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "arrow_downward"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([Math.floor(number(params.A))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
