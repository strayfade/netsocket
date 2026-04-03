const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addInput("B", "number");
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "Math/Less Than or Equal To"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.bigText = "<="
NodeDefinition.prototype.title_mode = "LiteGraph.NO_TITLE"
NodeDefinition.prototype.collapsible = "false"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([number(params.A) <= number(params.B)]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }