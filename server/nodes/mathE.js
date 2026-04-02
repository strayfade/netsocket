const { log, logColors } = require('../log')

class NodeDefinition {
    constructor() {
        this.addOutput("Value", "number");
    }
}
NodeDefinition.prototype.title = "Math/Constants/e"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.bigText = "e"
NodeDefinition.prototype.title_mode = "LiteGraph.NO_TITLE"
NodeDefinition.prototype.collapsible = "false"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([Math.E]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }