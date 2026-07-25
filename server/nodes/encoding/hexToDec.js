const { string } = require('../../utils/inputParser')
const { hexToDec } = require('../../utils/encodingTools')

class NodeDefinition {
    constructor() {
        this.addInput("Hex", "string");
        this.addProperty("Hex", "00");
        this.addOutput("Decimal", "number");
    }
}
NodeDefinition.prototype.title = "Encoding/Hex To Dec"
NodeDefinition.prototype.description = "Converts a two-digit hex byte string (00–FF) to a decimal number 0–255."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "code"
const NodeFunction = async (node, params, behaviors) => {
    const result = hexToDec(string(params.Hex));
    await behaviors.populateNextNodeLinks([Number.isFinite(result) ? result : 0]);
    return Number.isFinite(result);
}
module.exports = { NodeDefinition, NodeFunction }
