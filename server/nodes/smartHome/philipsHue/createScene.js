const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Type", "string");
        this.addEnumProperty("Type", "LightScene", ["LightScene","GroupScene"]);
        this.addInput("Payload (JSON)", "string");
        this.addProperty("Payload (JSON)", "{\"name\":\"Relax\",\"lights\":[],\"type\":\"LightScene\"}");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Scene", "object");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Scenes/Create Scene"
NodeDefinition.prototype.description = "Creates a scene from type and JSON payload."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueWrite(behaviors, async (api, behaviors) => {
        const type = string(params.Type).toLowerCase()
        const payload = json(params["Payload (JSON)"])
        const scene = hueModel.createFromBridge(type, 0, payload)
        const created = await api.scenes.createScene(scene)
        await behaviors.populateNextNodeLinks([created])
    })
}

module.exports = { NodeDefinition, NodeFunction }
