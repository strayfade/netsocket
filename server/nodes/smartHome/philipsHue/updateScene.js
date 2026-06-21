const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("ID", "string");
        this.addInput("Attributes (JSON)", "string");
        this.addProperty("Attributes (JSON)", "{\"name\":\"Evening\"}");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Result", "object");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Scenes/Update Scene"
NodeDefinition.prototype.description = "Updates scene metadata by ID using a JSON patch."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueWrite(behaviors, async (api, behaviors) => {
        const scene = await api.scenes.getScene(string(params.ID))
        const updated = mergeModelPayload(scene, json(params["Attributes (JSON)"]))
        const result = await api.scenes.updateScene(updated)
        await behaviors.populateNextNodeLinks([result])
    })
}

module.exports = { NodeDefinition, NodeFunction }
