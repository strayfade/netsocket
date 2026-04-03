const { log, logColors } = require('../log')
const { number, string, bool } = require('../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Time/Current Timestamp"
NodeDefinition.prototype.color = "yellow"
NodeDefinition.prototype.icon = "calendar_clock"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([ Date.now() ]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }