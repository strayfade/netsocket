const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addOutput("Value", "boolean");
        this.addEnumProperty("Value", "False", ["True", "False"]);
    }
}
NodeDefinition.prototype.title = "Constants/Boolean"
NodeDefinition.prototype.description = "Outputs a fixed boolean value selected from True or False in the node property."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "input"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([bool(params.Value)]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }