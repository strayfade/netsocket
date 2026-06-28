const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')
const axios = require('axios')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("URL", "string")
        this.addProperty("URL", "")
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Response", "string")
    }
}
NodeDefinition.prototype.title = "Web/GET Request"
NodeDefinition.prototype.description = "Sends an HTTP GET request to a URL and outputs the response body as a JSON string."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		URL: {"description":"Request target URL.","structure":"HTTP or HTTPS URL string.","required":true},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Response: {"description":"Primary text output.","structure":"Text response from the operation.","mcpKey":"Response"},
	},
}
NodeDefinition.prototype.color = "blue"
NodeDefinition.prototype.icon = "downloading"
const NodeFunction = async (node, params, behaviors) => {

    let webContent = await axios.get(string(io.input.URL))
    if (webContent.data)
        webContent.data = JSON.stringify(webContent.data)

    await behaviors.populateNextNodeLinks([webContent.data]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }