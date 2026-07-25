const { string } = require('../../utils/inputParser')
const { htmlEscape } = require('../../utils/encodingTools')

class NodeDefinition {
    constructor() {
        this.addInput("Text", "string");
        this.addProperty("Text", "");
        this.addOutput("Escaped", "string");
    }
}
NodeDefinition.prototype.title = "Encoding/HTML Escape"
NodeDefinition.prototype.description = "Escapes &, <, >, quotes, and apostrophes for safe HTML text content."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "html"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([htmlEscape(string(params.Text))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
