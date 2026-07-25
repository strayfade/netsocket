const { string } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addInput("Prefix", "string");
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "String/Starts With"
NodeDefinition.prototype.description = "Outputs true if the input string starts with the given prefix."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "start"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([string(params.String).startsWith(string(params.Prefix))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
