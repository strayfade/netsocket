const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Text", "string");
        this.addOutput("Encoded", "string");
    }
}
NodeDefinition.prototype.title = "Encoding/Base64 Encode"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "code"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([btoa(string(params.Text))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }