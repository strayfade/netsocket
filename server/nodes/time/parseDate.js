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
NodeDefinition.prototype.color = "yellow"
NodeDefinition.prototype.icon = "calendar_month"

const NodeFunction = async (node, params, behaviors) => {
    const timestamp = parseDate(params.Value)
    await behaviors.populateNextNodeLinks([Number.isFinite(timestamp) ? timestamp : 0]);
    return Number.isFinite(timestamp)
}

module.exports = { NodeDefinition, NodeFunction }
