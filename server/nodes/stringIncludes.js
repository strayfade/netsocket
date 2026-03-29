const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addInput("Search for", "string");
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "String/Includes"
NodeDefinition.prototype.color = "green"

const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([string(params["String"]).includes(string(params["Search for"]))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }