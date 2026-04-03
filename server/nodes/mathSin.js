const { log, logColors } = require('../log')
const { number, string, bool } = require('../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Trigonometry/sin"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.bigText = "sin"
NodeDefinition.prototype.title_mode = "LiteGraph.NO_TITLE"
NodeDefinition.prototype.collapsible = "false"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([ Math.sin(number(params.A)) ]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }