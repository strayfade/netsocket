const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Text", "string");
        this.addOutput("Encoded", "string");
    }
}
NodeDefinition.prototype.title = "Encoding/Base64 Encode"
NodeDefinition.prototype.description = "Encodes plain text into a Base64 string."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Text: {"description":"Input \"Text\" for Base64 Encode.","structure":"Plain text string (UTF-8).","required":true},
	},
	outputs: {
		Encoded: {"description":"Encoded produced by Base64 Encode.","structure":"Plain text string (UTF-8).","mcpKey":"Encoded"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "code"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([btoa(string(params.Text))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }