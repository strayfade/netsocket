const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("ID", "string");
        this.addInput("Config (JSON)", "string");
        this.addProperty("Config (JSON)", "{}");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Result", "object");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Sensors/Update Sensor Config"
NodeDefinition.prototype.description = "Updates sensor configuration attributes by ID."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueWrite(behaviors, async (api, behaviors) => {
        const sensor = await api.sensors.getSensor(string(params.ID))
        if (sensor.config)
            Object.assign(sensor.config, json(params["Config (JSON)"]))
        const result = await api.sensors.updateSensorConfig(sensor)
        await behaviors.populateNextNodeLinks([result])
    })
}

module.exports = { NodeDefinition, NodeFunction }
