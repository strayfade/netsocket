const { number } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Number", "number");
        this.addInput("Decimals", "number");
        this.addProperty("Decimals", "2");
        this.addOutput("Text", "string");
    }
}
NodeDefinition.prototype.title = "Math/Format Number"
NodeDefinition.prototype.description = "Formats a number with a fixed number of decimal places (toFixed) and outputs a string."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "pin"
const NodeFunction = async (node, params, behaviors) => {
    const decimals = Math.max(0, Math.min(100, Math.trunc(number(params.Decimals))));
    await behaviors.populateNextNodeLinks([number(params.Number).toFixed(decimals)]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
