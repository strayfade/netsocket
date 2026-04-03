const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Delay (ms)", "number");
        this.addProperty("Delay (ms)", "1000");
        this.addOutput("", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Flow Control/Delay"
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "timer"
const NodeFunction = async (node, params, behaviors) => {
    await new Promise(resolve => setTimeout(resolve, number(params["Delay (ms)"])));
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }