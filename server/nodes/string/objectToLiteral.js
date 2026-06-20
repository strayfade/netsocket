const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Object", "string");
        this.addProperty("Object", "\"\"");
        this.addOutput("String", "");
    }
}
NodeDefinition.prototype.title = "String/Object to Literal (remove quotes)"
NodeDefinition.prototype.description = "Strips surrounding double quotes from a string value, useful for removing JSON string quoting."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "convert_to_text"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([string(params.Object).replace("\"", "").replace("\"", "")]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }