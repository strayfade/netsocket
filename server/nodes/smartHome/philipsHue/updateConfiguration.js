const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Config (JSON)", "string");
        this.addProperty("Config (JSON)", "{}");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Success", "boolean");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Bridge/Update Bridge Configuration"
NodeDefinition.prototype.description = "Updates bridge configuration using a JSON payload."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"Config (JSON)": {"description":"Input \"Config (JSON)\" for Update Bridge Configuration.","structure":"Plain text string (UTF-8).","required":false},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Success: {"description":"Success produced by Update Bridge Configuration.","structure":"Boolean true or false.","mcpKey":"Success"},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueWrite(behaviors, async (api, behaviors) => {
        const success = await api.configuration.updateConfiguration(json(params["Config (JSON)"]))
        await behaviors.populateNextNodeLinks([success])
    })
}

module.exports = { NodeDefinition, NodeFunction }
