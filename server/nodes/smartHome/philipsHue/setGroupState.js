const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("ID", "string");
        this.addInput("State (JSON)", "string");
        this.addProperty("State (JSON)", "{\"on\":true}");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Success", "boolean");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Groups/Set Group State"
NodeDefinition.prototype.description = "Sets group action state using a JSON object (on, bri, hue, etc.)."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueWrite(behaviors, async (api, behaviors) => {
        const state = new GroupState().populate(json(params["State (JSON)"]))
        const success = await api.groups.setGroupState(string(params.ID), state)
        await behaviors.populateNextNodeLinks([success])
    })
}

module.exports = { NodeDefinition, NodeFunction }
