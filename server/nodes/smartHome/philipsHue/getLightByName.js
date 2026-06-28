const { log, logColors } = require('../../../log')
const { number, string, bool } = require('../../../utils/inputParser')
const { getHueApi, LightState, hueApiLib, doesHueApiWork } = require('../../../utils/hueApi')
const { serializeHueArray, failArrayJson } = require('../../../utils/hueNodeHelpers')

class NodeDefinition {
    constructor() {
        this.addInput("Name", "string");
        this.addProperty("Name", "Hue bloom 1");
        this.addOutput("Light Object", "array");
        this.addOutput("ID", "string");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Lights/Get Light by Name"
NodeDefinition.prototype.description = "Looks up a Philips Hue light by its friendly name and outputs matching lights as a JSON array string plus the first match ID. Requires a configured Hue bridge connection."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Name: {"description":"Resource name to look up or update.","structure":"Human-readable name string.","required":false},
	},
	outputs: {
		"Light Object": {"description":"Light Object produced by Get Light by Name.","structure":"Array of Philips Hue resource objects.","mcpKey":"Light Object"},
		ID: {"description":"Unique ID of the target resource.","structure":"Resource identifier string.","mcpKey":"ID"},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"
const NodeFunction = async (node, params, behaviors) => {
    if (!doesHueApiWork()) {
        await behaviors.populateNextNodeLinks([failArrayJson, ""]);
        return false;
    }
    let light = await getHueApi()?.lights?.getLightByName(string(params.Name))
    await behaviors.populateNextNodeLinks([
        serializeHueArray(light),
        light?.[0]?.data?.id ?? "",
    ]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }