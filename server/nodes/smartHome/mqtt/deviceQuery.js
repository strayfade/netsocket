const { string } = require('../../../utils/inputParser')
const store = require('../../../manager/smarthomeStore')

class NodeDefinition {
    constructor() {
        this.addInput("UniqueId", "string");
        this.addProperty("UniqueId", "");
        this.addOutput("State", "string");
        this.addOutput("Availability", "string");
        this.addOutput("Device", "JSON");
    }
}
NodeDefinition.prototype.title = "Smart Home/Device Query"
NodeDefinition.prototype.description = "Reads the last retained state, availability, and registry record for a smart-home device entity. Served from the local cache; no broker round trip."
NodeDefinition.prototype.portMeta = {
	inputs: {
		UniqueId: {"description":"Stable entity ID to read.","structure":"Device entity unique ID string.","required":true},
	},
	outputs: {
		State: {"description":"Last reported state text (empty when never reported).","structure":"Plain text string (UTF-8).","mcpKey":"State"},
		Availability: {"description":"Device availability (online, offline, or unknown).","structure":"Availability string.","mcpKey":"Availability"},
		Device: {"description":"Registry record for the owning device.","structure":"Device object.","mcpKey":"Device"},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "info"

const failDevice = {}

const NodeFunction = async (node, params, behaviors) => {
    const uniqueId = string(params["UniqueId"])
    const entity = uniqueId ? store.getEntity(uniqueId) : null
    if (!entity) {
        await behaviors.populateNextNodeLinks(["", "unknown", failDevice])
        return false
    }
    const device = store.getDevice(entity.deviceId || "")
    await behaviors.populateNextNodeLinks([
        entity.lastState == null ? "" : String(entity.lastState),
        (device && device.availability) || "unknown",
        device || failDevice
    ])
    return true
}
module.exports = { NodeDefinition, NodeFunction }
