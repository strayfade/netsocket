const { number } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Min", "number");
        this.addProperty("Min", "0");
        this.addInput("Max", "number");
        this.addProperty("Max", "1");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Random"
NodeDefinition.prototype.description = "Outputs a random number in the half-open range [Min, Max)."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "casino"
const NodeFunction = async (node, params, behaviors) => {
    const min = number(params.Min);
    const max = number(params.Max);
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    await behaviors.populateNextNodeLinks([lo + Math.random() * (hi - lo)]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
