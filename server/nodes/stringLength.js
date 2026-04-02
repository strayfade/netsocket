const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "String/Length"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "straighten"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([ number(string(params["String"]).length.toString()) ]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }