const { string } = require('../../utils/inputParser')
const { urlDecode } = require('../../utils/encodingTools')

class NodeDefinition {
    constructor() {
        this.addInput("Encoded", "string");
        this.addProperty("Encoded", "");
        this.addOutput("Text", "string");
    }
}
NodeDefinition.prototype.title = "Encoding/URL Decode"
NodeDefinition.prototype.description = "Decodes a percent-encoded URL string (decodeURIComponent)."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "link"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([urlDecode(string(params.Encoded))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
