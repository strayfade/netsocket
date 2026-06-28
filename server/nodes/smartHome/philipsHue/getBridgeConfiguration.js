const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {

        this.addOutput("Configuration", "object");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Bridge/Get Bridge Configuration"
NodeDefinition.prototype.description = "Returns the authenticated bridge configuration object."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		Configuration: {"description":"Configuration produced by Get Bridge Configuration.","structure":"JSON object (may be serialized as a string in some nodes).","mcpKey":"Configuration"},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueRead(behaviors, [failObject], async (api) => {
        return [await api.configuration.getConfiguration()]
    })
}

module.exports = { NodeDefinition, NodeFunction }
