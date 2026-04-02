const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Text", "string");
        this.addOutput("", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Debugging/Print"
NodeDefinition.prototype.color = "blue"
NodeDefinition.prototype.icon = "browse_activity"
const NodeFunction = async (node, params, behaviors) => {
    log(`[DebugPrint] ${string(params.Text)}`, logColors.Success)
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }