const { number } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Absolute"
NodeDefinition.prototype.description = "Outputs the absolute value of a number."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "absolute"
NodeDefinition.prototype.bigText = "|A|"
NodeDefinition.prototype.title_mode = "LiteGraph.NO_TITLE"
NodeDefinition.prototype.collapsible = "false"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([Math.abs(number(params.A))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
