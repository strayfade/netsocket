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
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Type: {"description":"Input \"Type\" for Create CLIP Sensor.","structure":"Plain text string (UTF-8).","required":false},
		"Payload (JSON)": {"description":"Input \"Payload (JSON)\" for Create CLIP Sensor.","structure":"Plain text string (UTF-8).","required":false},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Sensor: {"description":"Sensor produced by Create CLIP Sensor.","structure":"JSON object (may be serialized as a string in some nodes).","mcpKey":"Sensor"},
	},
}
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
