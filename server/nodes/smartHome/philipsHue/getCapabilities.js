const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {

        this.addOutput("Capabilities", "object");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Bridge/Get Capabilities"
NodeDefinition.prototype.description = "Returns bridge capability metadata."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		Capabilities: {"description":"Capabilities produced by Get Capabilities.","structure":"JSON object (may be serialized as a string in some nodes).","mcpKey":"Capabilities"},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueRead(behaviors, [failObject], async (api) => {
        return [await api.capabilities.getAll()]
    })
}

module.exports = { NodeDefinition, NodeFunction }
