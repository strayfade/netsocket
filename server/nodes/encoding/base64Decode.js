const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Encoded", "string");
        this.addOutput("Text", "string");
    }
}
NodeDefinition.prototype.title = "Encoding/Base64 Decode"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "code_off"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([atob(string(params.Encoded))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }