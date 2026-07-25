const { string, json } = require('../../utils/inputParser')
const { formatTemplate } = require('../../utils/stringTools')

class NodeDefinition {
    constructor() {
        this.addInput("Template", "string");
        this.addProperty("Template", "Hello {name}");
        this.addInput("Values", "object");
        this.addProperty("Values", "{\"name\":\"world\"}");
        this.addOutput("Text", "string");
    }
}
NodeDefinition.prototype.title = "String/Format"
NodeDefinition.prototype.description = "Formats a template string by replacing {key} placeholders with values from a JSON object."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "format_shapes"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([formatTemplate(string(params.Template), json(params.Values))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
