const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Timestamp", "number");
        this.addProperty("Timestamp", "0");
        this.addOutput("", "string");
    }
}
NodeDefinition.prototype.title = "Time/To Date String"
NodeDefinition.prototype.description = "Formats a timestamp as a human-readable date string in local time (e.g. \"Sat Jun 20 2026\")."
NodeDefinition.prototype.color = "yellow"
NodeDefinition.prototype.icon = "convert_to_text"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([ new Date(number(params.Timestamp)).toDateString() ]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }