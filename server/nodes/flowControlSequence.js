const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Delay (ms)", "number");
        this.addOutput("1", LiteGraph.EVENT);
        this.addOutput("2", LiteGraph.EVENT);
        this.addOutput("3", LiteGraph.EVENT);
        this.addOutput("4", LiteGraph.EVENT);
        this.addOutput("5", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Flow Control/Sequence"
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "order_play"
const NodeFunction = async (node, params, behaviors) => {
    for (i in [0, 1, 2, 3, 4]) {
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[i]);
        await new Promise(resolve => setTimeout(resolve, number(params["Delay (ms)"])));
    }
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[3]);
}
module.exports = { NodeDefinition, NodeFunction }