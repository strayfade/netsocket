const { log, logColors } = require('../../../log')
const { number, string, bool } = require('../../../utils/inputParser')
const { getHueApi, LightState, hueApiLib, doesHueApiWork } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("ID", "string");
        this.addOutput("State Object", "object");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Lights/Get Light State by ID"
NodeDefinition.prototype.description = "Retrieves the current state object for a Philips Hue light by its ID. Requires a configured Hue bridge connection."
NodeDefinition.prototype.portMeta = {
	inputs: {
		ID: {"description":"Unique ID of the target resource.","structure":"Resource identifier string.","required":true},
	},
	outputs: {
		"State Object": {"description":"State Object produced by Get Light State by ID.","structure":"JSON object (may be serialized as a string in some nodes).","mcpKey":"State Object"},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"
const NodeFunction = async (node, params, behaviors) => {
    if (!doesHueApiWork()) {
        await behaviors.populateNextNodeLinks([{}]);
        return false;
    }
    let state = await getHueApi()?.lights?.getLightState(string(params.ID))
    await behaviors.populateNextNodeLinks([state]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }