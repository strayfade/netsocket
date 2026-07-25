const { string } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addInput("Suffix", "string");
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "String/Ends With"
NodeDefinition.prototype.description = "Outputs true if the input string ends with the given suffix."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "last_page"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([string(params.String).endsWith(string(params.Suffix))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
