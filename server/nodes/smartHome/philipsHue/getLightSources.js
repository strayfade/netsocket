const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {

        this.addOutput("Groups", "array");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Groups/Get Light Sources"
NodeDefinition.prototype.description = "Returns light sources from the Hue bridge."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueRead(behaviors, [failArray], async (api) => {
        return [await api.groups.getLightSources()]
    })
}

module.exports = { NodeDefinition, NodeFunction }
