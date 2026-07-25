const { string, number } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addInput("Radix", "number");
        this.addProperty("Radix", "10");
        this.addOutput("Number", "number");
    }
}
NodeDefinition.prototype.title = "String/To Number (parseInt)"
NodeDefinition.prototype.description = "Parses a string as an integer using parseInt with a configurable radix (2–36)."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "convert_to_text"
const NodeFunction = async (node, params, behaviors) => {
    let radix = Math.trunc(number(params.Radix));
    if (radix < 2 || radix > 36) radix = 10;
    const result = parseInt(string(params.String), radix);
    await behaviors.populateNextNodeLinks([Number.isFinite(result) ? result : 0]);
    return Number.isFinite(result);
}
module.exports = { NodeDefinition, NodeFunction }
