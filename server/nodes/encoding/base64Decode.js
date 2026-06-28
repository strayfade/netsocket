const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Encoded", "string");
        this.addOutput("Text", "string");
    }
}
NodeDefinition.prototype.title = "Encoding/Base64 Decode"
NodeDefinition.prototype.description = "Decodes a Base64-encoded string back into plain text."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Encoded: {"description":"Input \"Encoded\" for Base64 Decode.","structure":"Plain text string (UTF-8).","required":true},
	},
	outputs: {
		Text: {"description":"Text produced by Base64 Decode.","structure":"Plain text string (UTF-8).","mcpKey":"Text"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "code_off"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([atob(string(params.Encoded))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }