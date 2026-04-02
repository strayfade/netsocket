const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')
const { getVar, setVar } = require('./utils/vars')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Name", "string")
        this.addInput("New Value", "string")
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Value", "string")
    }
}
NodeDefinition.prototype.title = "Variables/Set Variable"
NodeDefinition.prototype.color = "blue"
NodeDefinition.prototype.icon = "database_upload"
const NodeFunction = async (node, params, behaviors) => {
    setVar(string(params["Name"]), string(params["New Value"]))
    await behaviors.populateNextNodeLinks([getVar(string(params["Name"]))]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }