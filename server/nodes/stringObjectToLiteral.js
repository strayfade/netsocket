const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Object", "string");
        this.addProperty("Object", "\"\"");
        this.addOutput("String", "");
    }
}
NodeDefinition.prototype.title = "String/Object to Literal (remove quotes)"
NodeDefinition.prototype.color = "green"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([string(params.Object).replace("\"", "").replace("\"", "")]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }