const { log, logColors } = require('../../log')
const { string } = require('../../utils/inputParser')
const { performWebRequest } = require('../../utils/httpRequest')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("URL", "string")
        this.addProperty("URL", "")
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Response", "string")
        this.addOutput("Status", "number")
    }
}
NodeDefinition.prototype.title = "Web/DELETE Request"
NodeDefinition.prototype.description = "Sends an HTTP DELETE request to a URL and outputs the response body and status code."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		URL: {"description":"Request target URL.","structure":"HTTP or HTTPS URL string.","required":true},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Response: {"description":"Primary text output.","structure":"Text response from the operation.","mcpKey":"Response"},
		Status: {"description":"Status produced by DELETE Request.","structure":"Numeric value (integer or float).","mcpKey":"Status"},
	},
}
NodeDefinition.prototype.color = "blue"
NodeDefinition.prototype.icon = "delete"

const NodeFunction = async (node, params, behaviors) => {
    try {
        const result = await performWebRequest('DELETE', params.URL)
        await behaviors.populateNextNodeLinks([null, result.body, result.status]);
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
        return true
    } catch (error) {
        log(`DELETE request failed: ${error.message}`, logColors.Error)
        await behaviors.populateNextNodeLinks([null, "", 0]);
        return false
    }
}

module.exports = { NodeDefinition, NodeFunction }
