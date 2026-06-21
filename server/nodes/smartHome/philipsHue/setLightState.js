const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("ID", "string");
        this.addInput("State (JSON)", "string");
        this.addProperty("State (JSON)", "{\"on\":true,\"bri\":254}");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Result", "object");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Lights/Set Light State"
NodeDefinition.prototype.description = "Sets a light state using a JSON object (on, bri, hue, sat, xy, ct, etc.)."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueWrite(behaviors, async (api, behaviors) => {
        const result = await api.lights.setLightState(string(params.ID), json(params["State (JSON)"]))
        await behaviors.populateNextNodeLinks([result])
    })
}

module.exports = { NodeDefinition, NodeFunction }
