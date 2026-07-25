const { coalesceValue } = require('../../utils/stringTools')

class NodeDefinition {
    constructor() {
        this.addInput("Value", "object");
        this.addInput("Fallback", "object");
        this.addOutput("Result", "object");
    }
}
NodeDefinition.prototype.title = "Logic/Coalesce"
NodeDefinition.prototype.description = "Outputs the primary value unless it is null or empty string, otherwise outputs the fallback."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "alt_route"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([coalesceValue(params.Value, params.Fallback)]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
