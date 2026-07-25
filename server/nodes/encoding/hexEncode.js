const { string, bool } = require('../../utils/inputParser')
const { textToHex } = require('../../utils/encodingTools')

class NodeDefinition {
    constructor() {
        this.addInput("Text", "string");
        this.addProperty("Text", "");
        this.addInput("Uppercase", "boolean");
        this.addEnumProperty("Uppercase", "True", ["True", "False"]);
        this.addOutput("Hex", "string");
    }
}
NodeDefinition.prototype.title = "Encoding/Hex Encode"
NodeDefinition.prototype.description = "Encodes UTF-8 text as a hexadecimal byte string."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "code"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([textToHex(string(params.Text), bool(params.Uppercase))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
