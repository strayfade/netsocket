const { string } = require('../../../utils/inputParser')
const store = require('../../../manager/smarthomeStore')

class NodeDefinition {
    constructor() {
        this.addInput("Status", "string");
        this.addInput("Room", "string");
        this.addInput("Capability", "string");
        this.addProperty("Status", "approved");
        this.addProperty("Room", "");
        this.addProperty("Capability", "");
        this.addOutput("Devices", "JSON");
    }
}
NodeDefinition.prototype.title = "Smart Home/List Devices"
NodeDefinition.prototype.description = "Lists smart-home devices from the local registry as a JSON array string. Filter by approval status (empty for all), room, and capability."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Status: {"description":"Approval status filter (approved, pending, denied; empty for all).","structure":"Status string.","required":false},
		Room: {"description":"Room filter (empty for all rooms).","structure":"Room name string.","required":false},
		Capability: {"description":"Capability filter (empty for all).","structure":"Capability key string.","required":false},
	},
	outputs: {
		Devices: {"description":"Registry devices matching the filters.","structure":"JSON array (serialized as a string).","mcpKey":"Devices"},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "devices"

const NodeFunction = async (node, params, behaviors) => {
    const status = string(params["Status"])
    const room = string(params["Room"])
    const capability = string(params["Capability"])
    const devices = store.listDevices({
        status: status || undefined,
        room: room || undefined,
        capability: capability || undefined,
    })
    await behaviors.populateNextNodeLinks([JSON.stringify(devices)])
    return true
}
module.exports = { NodeDefinition, NodeFunction }
