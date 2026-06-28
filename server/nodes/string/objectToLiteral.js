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
NodeDefinition.prototype.portMeta = {
	inputs: {
		Object: {"description":"Input \"Object\" for Object to Literal (remove quotes).","structure":"Plain text string (UTF-8).","required":false},
	},
	outputs: {
		String: {"description":"String produced by Object to Literal (remove quotes).","structure":"Plain text string (UTF-8).","mcpKey":"String"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "convert_to_text"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([string(params.Object).replace("\"", "").replace("\"", "")]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }