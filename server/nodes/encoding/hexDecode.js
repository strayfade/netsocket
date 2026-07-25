const { string } = require('../../utils/inputParser')
const { hexToText } = require('../../utils/encodingTools')

class NodeDefinition {
    constructor() {
        this.addInput("Hex", "string");
        this.addProperty("Hex", "");
        this.addOutput("Text", "string");
    }
}
NodeDefinition.prototype.title = "Encoding/Hex Decode"
NodeDefinition.prototype.description = "Decodes a hexadecimal byte string into UTF-8 text."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "code"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([hexToText(string(params.Hex))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
