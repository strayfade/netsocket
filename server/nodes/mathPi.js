const { log, logColors } = require('../log')

class NodeDefinition {
    constructor() {
        this.addOutput("Value", "number");
    }
}
NodeDefinition.prototype.title = "Math/Constants/Pi"
NodeDefinition.prototype.color = "green"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([Math.PI]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }