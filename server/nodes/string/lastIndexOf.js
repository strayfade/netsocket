const { string } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addInput("Search for", "string");
        this.addOutput("Index", "number");
    }
}
NodeDefinition.prototype.title = "String/Last Index Of"
NodeDefinition.prototype.description = "Returns the last index of a substring, or -1 if not found."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "search"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([string(params.String).lastIndexOf(string(params["Search for"]))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
