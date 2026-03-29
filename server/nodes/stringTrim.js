const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addOutput("", "string");
    }
}
NodeDefinition.prototype.title = "String/Trim"
NodeDefinition.prototype.color = "green"

const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([ string(params["String"]).trim() ]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }