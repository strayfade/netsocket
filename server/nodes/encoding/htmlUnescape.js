const { string } = require('../../utils/inputParser')
const { htmlUnescape } = require('../../utils/encodingTools')

class NodeDefinition {
    constructor() {
        this.addInput("Escaped", "string");
        this.addProperty("Escaped", "");
        this.addOutput("Text", "string");
    }
}
NodeDefinition.prototype.title = "Encoding/HTML Unescape"
NodeDefinition.prototype.description = "Converts common HTML entities back into plain text characters."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "html"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([htmlUnescape(string(params.Escaped))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
