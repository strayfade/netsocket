const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {

        this.addOutput("Resource Links", "array");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Resource Links/Get All Resource Links"
NodeDefinition.prototype.description = "Returns all resource links on the Hue bridge."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		"Resource Links": {"description":"Resource Links produced by Get All Resource Links.","structure":"Array of Philips Hue resource objects.","mcpKey":"Resource Links"},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueRead(behaviors, [failArray], async (api) => {
        return [await api.resourceLinks.getAll()]
    })
}

module.exports = { NodeDefinition, NodeFunction }
