const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Payload (JSON)", "string");
        this.addProperty("Payload (JSON)", "{\"name\":\"My link\",\"links\":[],\"class\":\"device\"}");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Resource Link", "object");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Resource Links/Create Resource Link"
NodeDefinition.prototype.description = "Creates a resource link from a JSON payload."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueWrite(behaviors, async (api, behaviors) => {
        const payload = json(params["Payload (JSON)"])
        const link = hueModel.createFromBridge('resourcelink', 0, payload)
        const created = await api.resourceLinks.createResourceLink(link)
        await behaviors.populateNextNodeLinks([created])
    })
}

module.exports = { NodeDefinition, NodeFunction }
