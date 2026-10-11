const { string } = require('../../../utils/inputParser')
// Self-registers the MQTT state listener on load so device state changes
// reach graphs without any boot wiring beyond node discovery.
require('../../../utils/smarthomeEvents')

class NodeDefinition {
    constructor() {
        this.addProperty("UniqueId", "");
        this.addProperty("Capability", "");
        this.addProperty("Room", "");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("UniqueId", "string");
        this.addOutput("State", "string");
        this.addOutput("Device Name", "string");
        this.addOutput("Capability", "string");
    }
}
NodeDefinition.prototype.title = "Smart Home/Device Event"
NodeDefinition.prototype.description = "Triggers when an approved smart-home device reports state (or availability). Filter by entity unique ID, capability, and room via node properties; empty means any."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		UniqueId: {"description":"Stable entity ID that reported state.","structure":"Device entity unique ID string.","mcpKey":"UniqueId"},
		State: {"description":"Reported state text (ON/OFF, position, sensor reading, online/offline).","structure":"Plain text string (UTF-8).","mcpKey":"State"},
		"Device Name": {"description":"Friendly device name (or device ID when unnamed).","structure":"Human-readable name string.","mcpKey":"Device Name"},
		Capability: {"description":"Primary capability of the reporting entity.","structure":"Capability key string.","mcpKey":"Capability"},
	},
}
NodeDefinition.prototype.color = "black"
NodeDefinition.prototype.icon = "sensors"

const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([
        null,
        string(params["UniqueId"]),
        string(params["State"]),
        string(params["Device Name"]),
        string(params["Capability"])
    ]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0] || []);
    return true
}
module.exports = { NodeDefinition, NodeFunction }
