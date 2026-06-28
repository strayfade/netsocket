const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {

        this.addOutput("Lights", "array");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Lights/Get All Lights"
NodeDefinition.prototype.description = "Returns all lights registered on the Hue bridge as a JSON array string."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		Lights: {"description":"All lights registered on the Hue bridge.","structure":"Array of Philips Hue light objects (id, name, state, type, etc.).","mcpKey":"Lights"},
	},
}
NodeDefinition.prototype.mcpPreferred = "Prefer for listing all controllable Philips Hue lights on the bridge. Use before Set Light State nodes when you need light IDs or names."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueRead(behaviors, [failArray], async (api) => {
        return [await api.lights.getAll()]
    })
}

module.exports = { NodeDefinition, NodeFunction }
