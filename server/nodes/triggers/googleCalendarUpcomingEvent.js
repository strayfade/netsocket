const { string } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Event ID", "string")
        this.addOutput("Summary", "string")
        this.addOutput("Start", "string")
        this.addOutput("End", "string")
        this.addOutput("Calendar ID", "string")
        this.addOutput("Payload", "string")
        this.addProperty("Lookahead Minutes", "15")
    }
}
NodeDefinition.prototype.title = "Triggers/Google Calendar Upcoming Event"
NodeDefinition.prototype.color = "black"
NodeDefinition.prototype.icon = "event"

const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([
        null,
        string(params["Event ID"]),
        string(params["Summary"]),
        string(params["Start"]),
        string(params["End"]),
        string(params["Calendar ID"]),
        string(params["Payload"])
    ]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}

module.exports = { NodeDefinition, NodeFunction }
