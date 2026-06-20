const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Timestamp", "number");
        this.addProperty("Timestamp", "0");
        this.addOutput("", "string");
    }
}
NodeDefinition.prototype.title = "Time/To ISO String"
NodeDefinition.prototype.description = "Formats a timestamp as an ISO 8601 UTC string (e.g. \"2026-06-20T12:00:00.000Z\")."
NodeDefinition.prototype.color = "yellow"
NodeDefinition.prototype.icon = "convert_to_text"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([ new Date(number(params.Timestamp)).toISOString() ]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }