const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Timestamp", "number");
        this.addProperty("Timestamp", "0");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Time/Get UTC Day of Week"
NodeDefinition.prototype.description = "Extracts the day of the week (0–6) from a timestamp in UTC."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Timestamp: {"description":"Point in time for the operation.","structure":"Unix timestamp in milliseconds or ISO date string.","required":true},
	},
	outputs: {
		"": {"description":"Primary output of Get UTC Day of Week.","structure":"Numeric value (integer or float).","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "yellow"
NodeDefinition.prototype.icon = "convert_to_text"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([ new Date(number(params.Timestamp)).getUTCDay() ]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }