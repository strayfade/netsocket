const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Number", "number");
        this.addOutput("String", "string");
    }
}
NodeDefinition.prototype.title = "String/To String (number)"
NodeDefinition.prototype.color = "green"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([number(params.Number).toString()]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }