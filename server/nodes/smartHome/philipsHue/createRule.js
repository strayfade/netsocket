const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Payload (JSON)", "string");
        this.addProperty("Payload (JSON)", "{\"name\":\"My rule\",\"conditions\":[],\"actions\":[]}");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Rule", "object");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Rules/Create Rule"
NodeDefinition.prototype.description = "Creates a rule from a JSON payload."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueWrite(behaviors, async (api, behaviors) => {
        const payload = json(params["Payload (JSON)"])
        const rule = hueModel.createFromBridge('rule', 0, payload)
        const created = await api.rules.createRule(rule)
        await behaviors.populateNextNodeLinks([created])
    })
}

module.exports = { NodeDefinition, NodeFunction }
