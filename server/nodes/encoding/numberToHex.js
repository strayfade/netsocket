const { number, bool } = require('../../utils/inputParser')
const { numberToHex } = require('../../utils/encodingTools')

class NodeDefinition {
    constructor() {
        this.addInput("Number", "number");
        this.addProperty("Number", "0");
        this.addInput("Width", "number");
        this.addProperty("Width", "0");
        this.addInput("Uppercase", "boolean");
        this.addEnumProperty("Uppercase", "True", ["True", "False"]);
        this.addOutput("Hex", "string");
    }
}
NodeDefinition.prototype.title = "Encoding/Number To Hex"
NodeDefinition.prototype.description = "Converts a non-negative integer to a hexadecimal string with optional zero-padding width."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "code"
const NodeFunction = async (node, params, behaviors) => {
    const hex = numberToHex(number(params.Number), number(params.Width), bool(params.Uppercase));
    await behaviors.populateNextNodeLinks([hex]);
    return hex.length > 0;
}
module.exports = { NodeDefinition, NodeFunction }
