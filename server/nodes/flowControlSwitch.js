const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);

        this.addInput("Input", "string");

        this.addInput("Condition 1", "string");
        this.addProperty("Condition 1", "match1")
        this.addInput("Condition 2", "string");
        this.addProperty("Condition 2", "match2")
        this.addInput("Condition 3", "string");
        this.addProperty("Condition 3", "match3")
        this.addInput("Condition 4", "string");
        this.addProperty("Condition 4", "match4")
        this.addInput("Condition 5", "string");
        this.addProperty("Condition 5", "match5")

        this.addOutput("1", LiteGraph.EVENT);
        this.addOutput("2", LiteGraph.EVENT);
        this.addOutput("3", LiteGraph.EVENT);
        this.addOutput("4", LiteGraph.EVENT);
        this.addOutput("5", LiteGraph.EVENT);
        this.addOutput("Default", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Flow Control/Switch"
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "arrow_split"
const NodeFunction = async (node, params, behaviors) => {
    let matched = false;
    for (i in [0, 1, 2, 3, 4]) {
        log(`Condition ${(parseInt(i) + 1).toString()}`)
        if (string(params.Input) == string(params[`Condition ${(parseInt(i) + 1).toString()}`])) {
            matched = true;
            await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[i]);
        }
    }
    if (!matched)
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[5]);
}
module.exports = { NodeDefinition, NodeFunction }