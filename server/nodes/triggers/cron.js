class NodeDefinition {
    constructor() {
        this.addOutput("", LiteGraph.EVENT);
        this.addProperty("Cron", "0 * * * *");
    }
}
NodeDefinition.prototype.title = "Triggers/Cron"
NodeDefinition.prototype.description = "Triggers on a cron schedule defined by a cron expression property (e.g. \"0 * * * *\" for hourly)."
NodeDefinition.prototype.color = "black"
NodeDefinition.prototype.icon = "schedule"

const NodeFunction = async (node, params, behaviors) => {
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }
