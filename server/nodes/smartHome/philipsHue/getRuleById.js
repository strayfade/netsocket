const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("ID", "string");
        this.addOutput("Rule", "object");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Rules/Get Rule by ID"
NodeDefinition.prototype.description = "Returns a rule by ID."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueRead(behaviors, [failObject], async (api) => {
        return [await api.rules.getRule(number(params.ID))]
    })
}

module.exports = { NodeDefinition, NodeFunction }
