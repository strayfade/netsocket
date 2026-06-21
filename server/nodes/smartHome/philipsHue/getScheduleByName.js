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
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueRead(behaviors, [failArray], async (api) => {
        return [await api.schedules.getScheduleByName(string(params.Name))]
    })
}

module.exports = { NodeDefinition, NodeFunction }
