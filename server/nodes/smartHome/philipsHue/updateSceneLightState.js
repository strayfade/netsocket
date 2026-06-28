const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Scene ID", "string");
        this.addInput("Light ID", "string");
        this.addInput("State (JSON)", "string");
        this.addProperty("State (JSON)", "{\"on\":true,\"bri\":200}");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Result", "object");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Scenes/Update Scene Light State"
NodeDefinition.prototype.description = "Updates one light state inside a scene."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"Scene ID": {"description":"Input \"Scene ID\" for Update Scene Light State.","structure":"Plain text string (UTF-8).","required":true},
		"Light ID": {"description":"Input \"Light ID\" for Update Scene Light State.","structure":"Plain text string (UTF-8).","required":true},
		"State (JSON)": {"description":"Input \"State (JSON)\" for Update Scene Light State.","structure":"Plain text string (UTF-8).","required":false},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Result: {"description":"Primary result of the node.","structure":"Computed result value.","mcpKey":"Result"},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueWrite(behaviors, async (api, behaviors) => {
        const state = new SceneLightState().populate(json(params["State (JSON)"]))
        const result = await api.scenes.updateLightState(string(params["Scene ID"]), string(params["Light ID"]), state)
        await behaviors.populateNextNodeLinks([result])
    })
}

module.exports = { NodeDefinition, NodeFunction }
