const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("ID", "string");
        this.addOutput("Group", "object");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Groups/Get Group by ID"
NodeDefinition.prototype.description = "Returns a single Hue group by ID."
NodeDefinition.prototype.portMeta = {
	inputs: {
		ID: {"description":"Unique ID of the target resource.","structure":"Resource identifier string.","required":true},
	},
	outputs: {
		Group: {"description":"Group produced by Get Group by ID.","structure":"JSON object (may be serialized as a string in some nodes).","mcpKey":"Group"},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueRead(behaviors, [failObject], async (api) => {
        return [await api.groups.getGroup(number(params.ID))]
    })
}

module.exports = { NodeDefinition, NodeFunction }
