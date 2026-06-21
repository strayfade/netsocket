const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("ID", "string");
        this.addOutput("Resource Link", "object");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Resource Links/Get Resource Link by ID"
NodeDefinition.prototype.description = "Returns a resource link by ID."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueRead(behaviors, [failObject], async (api) => {
        return [await api.resourceLinks.getResourceLink(string(params.ID))]
    })
}

module.exports = { NodeDefinition, NodeFunction }
