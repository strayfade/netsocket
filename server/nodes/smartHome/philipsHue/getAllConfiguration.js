const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {

        this.addOutput("Configuration", "object");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Bridge/Get All Configuration"
NodeDefinition.prototype.description = "Returns the full bridge state including lights, groups, scenes, and more."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		Configuration: {"description":"Configuration produced by Get All Configuration.","structure":"JSON object (may be serialized as a string in some nodes).","mcpKey":"Configuration"},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueRead(behaviors, [failObject], async (api) => {
        return [await api.configuration.getAll()]
    })
}

module.exports = { NodeDefinition, NodeFunction }
