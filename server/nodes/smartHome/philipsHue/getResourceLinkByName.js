const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("Name", "string");
        this.addOutput("Resource Links", "array");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Resource Links/Get Resource Link by Name"
NodeDefinition.prototype.description = "Returns resource links matching the given name."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Name: {"description":"Resource name to look up or update.","structure":"Human-readable name string.","required":true},
	},
	outputs: {
		"Resource Links": {"description":"Resource Links produced by Get Resource Link by Name.","structure":"Array of Philips Hue resource objects.","mcpKey":"Resource Links"},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueRead(behaviors, [failArray], async (api) => {
        return [await api.resourceLinks.getResourceLinkByName(string(params.Name))]
    })
}

module.exports = { NodeDefinition, NodeFunction }
