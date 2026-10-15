const { string } = require('../../utils/inputParser')
class NodeDefinition {
    constructor() {
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Clipboard Content", "string")
        this.addOutput("Device ID", "string")
    }
}
NodeDefinition.prototype.title = "Triggers/Clipboard Updated"
NodeDefinition.prototype.description = "Triggers when a connected device with Send Clipboard enabled copies text or an image. Outputs the clipboard content and the originating device ID."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"Clipboard Content": {"description":"Text that was copied, or an image encoded as a data URL.","structure":"Plain text string (UTF-8), or data:image/png|jpeg|webp;base64,...","mcpKey":"Clipboard Content"},
		"Device ID": {"description":"Stable device identifier of the client that copied the content.","structure":"UUID string (8-4-4-4-12 hex), or empty when not provided.","mcpKey":"Device ID"},
	},
}
NodeDefinition.prototype.color = "black"
NodeDefinition.prototype.icon = "content_paste"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([
        null,
        string(params["Clipboard Content"]),
        string(params["Device ID"])
    ]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }
