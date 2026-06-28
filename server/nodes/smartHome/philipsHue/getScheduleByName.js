const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("Name", "string");
        this.addOutput("Schedules", "array");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Schedules/Get Schedule by Name"
NodeDefinition.prototype.description = "Returns schedules matching the given name."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Name: {"description":"Resource name to look up or update.","structure":"Human-readable name string.","required":true},
	},
	outputs: {
		Schedules: {"description":"Schedules produced by Get Schedule by Name.","structure":"Array of Philips Hue resource objects.","mcpKey":"Schedules"},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueRead(behaviors, [failArray], async (api) => {
        return [await api.schedules.getScheduleByName(string(params.Name))]
    })
}

module.exports = { NodeDefinition, NodeFunction }
