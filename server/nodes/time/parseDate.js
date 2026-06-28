const { string } = require('../../utils/inputParser')
const { parseDate } = require('../../utils/timeTools')

class NodeDefinition {
    constructor() {
        this.addInput("Value", "string");
        this.addProperty("Value", "");
        this.addOutput("Timestamp", "number");
    }
}
NodeDefinition.prototype.title = "Time/Parse Date"
NodeDefinition.prototype.description = "Parses a date string into a Unix timestamp in milliseconds, outputting 0 if parsing fails."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Value: {"description":"Data value for the operation.","structure":"Value to store or compare.","required":true},
	},
	outputs: {
		Timestamp: {"description":"Point in time for the operation.","structure":"Unix timestamp in milliseconds or ISO date string.","mcpKey":"Timestamp"},
	},
}
NodeDefinition.prototype.color = "yellow"
NodeDefinition.prototype.icon = "calendar_month"

const NodeFunction = async (node, params, behaviors) => {
    const timestamp = parseDate(params.Value)
    await behaviors.populateNextNodeLinks([Number.isFinite(timestamp) ? timestamp : 0]);
    return Number.isFinite(timestamp)
}

module.exports = { NodeDefinition, NodeFunction }
