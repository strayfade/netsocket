const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Timestamp", "number");
        this.addProperty("Timestamp", "0");
        this.addOutput("", "string");
    }
}
NodeDefinition.prototype.title = "Time/To Locale String"
NodeDefinition.prototype.description = "Formats a timestamp as a locale-aware date and time string using the server's default locale."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Timestamp: {"description":"Point in time for the operation.","structure":"Unix timestamp in milliseconds or ISO date string.","required":true},
	},
	outputs: {
		"": {"description":"Primary output of To Locale String.","structure":"Plain text string (UTF-8).","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "yellow"
NodeDefinition.prototype.icon = "convert_to_text"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([ new Date(number(params.Timestamp)).toLocaleString() ]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }