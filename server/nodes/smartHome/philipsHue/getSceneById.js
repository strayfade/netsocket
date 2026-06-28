const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("ID", "string");
        this.addOutput("Scene", "object");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Scenes/Get Scene by ID"
NodeDefinition.prototype.description = "Returns a scene by its ID."
NodeDefinition.prototype.portMeta = {
	inputs: {
		ID: {"description":"Unique ID of the target resource.","structure":"Resource identifier string.","required":true},
	},
	outputs: {
		Scene: {"description":"Scene produced by Get Scene by ID.","structure":"JSON object (may be serialized as a string in some nodes).","mcpKey":"Scene"},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueRead(behaviors, [failObject], async (api) => {
        return [await api.scenes.getScene(string(params.ID))]
    })
}

module.exports = { NodeDefinition, NodeFunction }
