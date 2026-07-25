const { number } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addInput("B", "number");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Min"
NodeDefinition.prototype.description = "Outputs the smaller of two numbers."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "arrow_downward"
NodeDefinition.prototype.bigText = "min"
NodeDefinition.prototype.title_mode = "LiteGraph.NO_TITLE"
NodeDefinition.prototype.collapsible = "false"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([Math.min(number(params.A), number(params.B))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
