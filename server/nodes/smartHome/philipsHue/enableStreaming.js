const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("ID", "string");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Success", "boolean");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Groups/Enable Entertainment Streaming"
NodeDefinition.prototype.description = "Enables streaming on an entertainment group."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueWrite(behaviors, async (api, behaviors) => {
        const success = await api.groups.enableStreaming(string(params.ID))
        await behaviors.populateNextNodeLinks([success])
    })
}

module.exports = { NodeDefinition, NodeFunction }
