const { number } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Decimal", "number");
        this.addProperty("Decimal", "0");
        this.addOutput("Hex", "string");
    }
}
NodeDefinition.prototype.title = "Encoding/Dec To Hex"
NodeDefinition.prototype.description = "Converts a decimal byte value (0–255) to a two-digit uppercase hex string (00–FF)."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Decimal: {"description":"Decimal byte value to encode.","structure":"Integer from 0 to 255; values outside the range are clamped.","required":true},
	},
	outputs: {
		Hex: {"description":"Two-digit uppercase hex string for the input byte.","structure":"Two-character hex string such as 00 or FF.","mcpKey":"Hex"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "code"

const NodeFunction = async (node, params, behaviors) => {
    const clamped = Math.min(255, Math.max(0, Math.round(number(params.Decimal))));
    const hex = clamped.toString(16).toUpperCase().padStart(2, "0");
    await behaviors.populateNextNodeLinks([hex]);
    return true
}

module.exports = { NodeDefinition, NodeFunction }
