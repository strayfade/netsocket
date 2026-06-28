const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("ID", "string");
        this.addOutput("State", "object");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Groups/Get Group State"
NodeDefinition.prototype.description = "Returns the current action state for a group."
NodeDefinition.prototype.portMeta = {
	inputs: {
		ID: {"description":"Unique ID of the target resource.","structure":"Resource identifier string.","required":true},
	},
	outputs: {
		State: {"description":"State produced by Get Group State.","structure":"JSON object (may be serialized as a string in some nodes).","mcpKey":"State"},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueRead(behaviors, [failObject], async (api) => {
        return [await api.groups.getGroupState(number(params.ID))]
    })
}

module.exports = { NodeDefinition, NodeFunction }
