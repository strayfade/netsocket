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
NodeDefinition.prototype.description = "Triggers when a Google Calendar event is approaching within a configurable lookahead window. Outputs event ID, summary, start, end, calendar ID, and payload."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"Event ID": {"description":"Event ID produced by Google Calendar Upcoming Event.","structure":"Plain text string (UTF-8).","mcpKey":"Event ID"},
		Summary: {"description":"Summary produced by Google Calendar Upcoming Event.","structure":"Plain text string (UTF-8).","mcpKey":"Summary"},
		Start: {"description":"Start produced by Google Calendar Upcoming Event.","structure":"Plain text string (UTF-8).","mcpKey":"Start"},
		End: {"description":"End produced by Google Calendar Upcoming Event.","structure":"Plain text string (UTF-8).","mcpKey":"End"},
		"Calendar ID": {"description":"Calendar ID produced by Google Calendar Upcoming Event.","structure":"Plain text string (UTF-8).","mcpKey":"Calendar ID"},
		Payload: {"description":"Payload produced by Google Calendar Upcoming Event.","structure":"Plain text string (UTF-8).","mcpKey":"Payload"},
	},
}
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
