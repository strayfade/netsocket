const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Type", "string");
        this.addEnumProperty("Type", "CLIPGenericFlag", ["CLIPGenericFlag","CLIPGenericStatus","CLIPHumidity","CLIPLightlevel","CLIPOpenClose","CLIPPresence","CLIPTemperature","CLIPSwitch"]);
        this.addInput("Payload (JSON)", "string");
        this.addProperty("Payload (JSON)", "{\"name\":\"My sensor\",\"modelid\":\"PHCLIPSOM01\"}");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Sensor", "object");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Sensors/Create CLIP Sensor"
NodeDefinition.prototype.description = "Creates a CLIP virtual sensor from type and JSON payload."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueWrite(behaviors, async (api, behaviors) => {
        const type = string(params.Type).toLowerCase()
        const payload = json(params["Payload (JSON)"])
        const sensor = hueModel.createFromBridge(type, 0, payload)
        const created = await api.sensors.createSensor(sensor)
        await behaviors.populateNextNodeLinks([created])
    })
}

module.exports = { NodeDefinition, NodeFunction }
