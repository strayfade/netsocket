const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {

        this.addOutput("Groups", "array");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Groups/Get Zones"
NodeDefinition.prototype.description = "Returns zones from the Hue bridge."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		Groups: {"description":"Groups produced by Get Zones.","structure":"Array of Philips Hue resource objects.","mcpKey":"Groups"},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueRead(behaviors, [failArray], async (api) => {
        return [await api.groups.getZones()]
    })
}

module.exports = { NodeDefinition, NodeFunction }
