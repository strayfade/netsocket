const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Timestamp", "number");
        this.addProperty("Timestamp", "0");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Time/Get Year"
NodeDefinition.prototype.color = "yellow"
NodeDefinition.prototype.icon = "convert_to_text"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([ new Date(number(params.Timestamp)).getFullYear() ]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }