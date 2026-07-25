const { number } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addInput("B", "number");
        this.addInput("Epsilon", "number");
        this.addProperty("Epsilon", "0");
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "Math/Equals"
NodeDefinition.prototype.description = "Outputs true when two numbers are equal within an optional epsilon tolerance."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "calculate"
NodeDefinition.prototype.bigText = "=="
NodeDefinition.prototype.title_mode = "LiteGraph.NO_TITLE"
NodeDefinition.prototype.collapsible = "false"
const NodeFunction = async (node, params, behaviors) => {
    const epsilon = Math.abs(number(params.Epsilon));
    const equal = Math.abs(number(params.A) - number(params.B)) <= epsilon;
    await behaviors.populateNextNodeLinks([equal]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
