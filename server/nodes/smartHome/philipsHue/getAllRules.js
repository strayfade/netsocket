const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {

        this.addOutput("Rules", "array");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Rules/Get All Rules"
NodeDefinition.prototype.description = "Returns all rules on the Hue bridge."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		Rules: {"description":"Rules produced by Get All Rules.","structure":"Array of Philips Hue resource objects.","mcpKey":"Rules"},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueRead(behaviors, [failArray], async (api) => {
        return [await api.rules.getAll()]
    })
}

module.exports = { NodeDefinition, NodeFunction }
