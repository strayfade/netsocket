const { number } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addInput("Decimals", "number");
        this.addProperty("Decimals", "0");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Round"
NodeDefinition.prototype.description = "Rounds a number to the nearest integer, or to a given number of decimal places."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "rounded_corner"
const NodeFunction = async (node, params, behaviors) => {
    const decimals = Math.max(0, Math.trunc(number(params.Decimals)));
    const factor = Math.pow(10, decimals);
    const result = Math.round(number(params.A) * factor) / factor;
    await behaviors.populateNextNodeLinks([result]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
