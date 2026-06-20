const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Timestamp", "number");
        this.addProperty("Timestamp", "0");
        this.addOutput("", "string");
    }
}
NodeDefinition.prototype.title = "Time/To Time String"
NodeDefinition.prototype.description = "Formats a timestamp as a local time string including timezone offset."
NodeDefinition.prototype.color = "yellow"
NodeDefinition.prototype.icon = "convert_to_text"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([ new Date(number(params.Timestamp)).toTimeString() ]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }