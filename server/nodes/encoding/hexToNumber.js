const { string } = require('../../utils/inputParser')
const { hexToNumber } = require('../../utils/encodingTools')

class NodeDefinition {
    constructor() {
        this.addInput("Hex", "string");
        this.addProperty("Hex", "0");
        this.addOutput("Number", "number");
    }
}
NodeDefinition.prototype.title = "Encoding/Hex To Number"
NodeDefinition.prototype.description = "Parses an arbitrary-length hexadecimal string into a decimal number."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "code"
const NodeFunction = async (node, params, behaviors) => {
    const result = hexToNumber(string(params.Hex));
    await behaviors.populateNextNodeLinks([Number.isFinite(result) ? result : 0]);
    return Number.isFinite(result);
}
module.exports = { NodeDefinition, NodeFunction }
