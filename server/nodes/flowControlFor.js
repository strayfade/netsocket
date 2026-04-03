const { log, logColors } = require('../log')
const { number, string, bool } = require('../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Loop Count", "number");
        this.addProperty("Loop Count", "3");
        this.addInput("Delay (ms)", "number");
        this.addOutput("On Loop", LiteGraph.EVENT);
        this.addOutput("Index", "number")
        this.addOutput("On Finish", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Flow Control/For"
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "cached"
const NodeFunction = async (node, params, behaviors) => {
    for (let i = 0; i < number(params["Loop Count"]); i++) {
        await behaviors.populateNextNodeLinks([
            null, i, null
        ]);
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
        if (i < number(params["Loop Count"]) - 1)
            await new Promise(resolve => setTimeout(resolve, number(params["Delay (ms)"])));
    }
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[2]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }