const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addInput("Exponent", "number");
        this.addProperty("Exponent", "2");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Exponent"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.bigText = "^"
NodeDefinition.prototype.title_mode = "LiteGraph.NO_TITLE"
NodeDefinition.prototype.collapsible = "false"
NodeDefinition.prototype.icon = "superscript"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([Math.pow(number(params.A), number(params.Exponent))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }