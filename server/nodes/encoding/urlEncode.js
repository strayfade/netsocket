const { string } = require('../../utils/inputParser')
const { urlEncode } = require('../../utils/encodingTools')

class NodeDefinition {
    constructor() {
        this.addInput("Text", "string");
        this.addProperty("Text", "");
        this.addOutput("Encoded", "string");
    }
}
NodeDefinition.prototype.title = "Encoding/URL Encode"
NodeDefinition.prototype.description = "Percent-encodes a string for use in URLs and query values (encodeURIComponent)."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "link"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([urlEncode(string(params.Text))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
