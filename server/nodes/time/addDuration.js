const { number, string } = require('../../utils/inputParser')
const { addDuration } = require('../../utils/timeTools')

class NodeDefinition {
    constructor() {
        this.addInput("Timestamp", "number");
        this.addProperty("Timestamp", "0");
        this.addInput("Amount", "number");
        this.addProperty("Amount", "1");
        this.addInput("Unit", "string");
        this.addEnumProperty("Unit", "hours", [
            "ms",
            "seconds",
            "minutes",
            "hours",
            "days",
        ]);
        this.addOutput("Timestamp", "number");
    }
}
NodeDefinition.prototype.title = "Time/Add Duration"
NodeDefinition.prototype.description = "Adds a duration (ms, seconds, minutes, hours, or days) to a timestamp and outputs the new timestamp in milliseconds."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Timestamp: {"description":"Point in time for the operation.","structure":"Unix timestamp in milliseconds or ISO date string.","required":true},
		Amount: {"description":"Input \"Amount\" for Add Duration.","structure":"Numeric value (integer or float).","required":false},
		Unit: {"description":"Input \"Unit\" for Add Duration.","structure":"Plain text string (UTF-8).","required":false},
	},
	outputs: {
		Timestamp: {"description":"Point in time for the operation.","structure":"Unix timestamp in milliseconds or ISO date string.","mcpKey":"Timestamp"},
	},
}
NodeDefinition.prototype.color = "yellow"
NodeDefinition.prototype.icon = "more_time"

const NodeFunction = async (node, params, behaviors) => {
    const base = number(params.Timestamp)
    const timestamp = addDuration(
        base > 0 ? base : Date.now(),
        number(params.Amount),
        string(params.Unit)
    )
    await behaviors.populateNextNodeLinks([Number.isFinite(timestamp) ? timestamp : 0]);
    return Number.isFinite(timestamp)
}

module.exports = { NodeDefinition, NodeFunction }
