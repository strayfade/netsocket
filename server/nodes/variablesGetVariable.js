const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')
const { getVar, setVar } = require('./utils/vars')

class NodeDefinition {
    constructor() {
        this.addProperty("Name", "")
        this.addOutput("Value", "string");
    }
}
NodeDefinition.prototype.title = "Variables/Get Variable"
NodeDefinition.prototype.color = "green"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([getVar(string(params["Name"]))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }