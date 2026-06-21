const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("ID", "string");
        this.addOutput("Sensor", "object");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Sensors/Get Sensor by ID"
NodeDefinition.prototype.description = "Returns a sensor by ID."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueRead(behaviors, [failObject], async (api) => {
        return [await api.sensors.getSensor(string(params.ID))]
    })
}

module.exports = { NodeDefinition, NodeFunction }
