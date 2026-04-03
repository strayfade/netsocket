const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "string");
        this.addInput("B", "string");
        this.addInput("Case-sensitive", "boolean");
        this.addProperty("Case-sensitive", "true");
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "String/Equals"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.bigText = "="
NodeDefinition.prototype.icon = "calculate"
const NodeFunction = async (node, params, behaviors) => {
    params.A = string(params.A)
    params.B = string(params.B)
    let caseSensitive = bool(params["Case-sensitive"])
    let output = (caseSensitive ? (params.A == params.B) : (params.A.toLowerCase() == params.B.toLowerCase())) ? "true" : "false"
    await behaviors.populateNextNodeLinks([output]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }