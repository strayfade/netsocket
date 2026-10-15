const { log, logColors } = require('../../log')
const { string } = require('../../utils/inputParser')
const { updateClipboard } = require('../../utils/alert')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Clipboard Content", "string");
        this.addInput("Device ID", "string");
        this.addOutput("", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Notifiers/Update Clipboard"
NodeDefinition.prototype.description = "Sets the clipboard on a connected device. Blank Device ID updates every connected device that has Receive Clipboard enabled."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		"Clipboard Content": {"description":"Text to place on the clipboard, or an image data URL.","structure":"Plain text string (UTF-8), or data:image/png|jpeg|webp;base64,...","required":false},
		"Device ID": {"description":"Optional target device ID. Blank updates every connected device.","structure":"UUID string (8-4-4-4-12 hex), or empty for all devices.","required":false},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
	},
}
NodeDefinition.prototype.color = "yellow"
NodeDefinition.prototype.icon = "content_copy"
const NodeFunction = async (node, params, behaviors) => {
    const content = string(params["Clipboard Content"])
    const deviceId = string(params["Device ID"])
    log(
        `[Clipboard] ${content.length} chars${deviceId ? ` (device: ${deviceId})` : ""}`,
        logColors.Warning
    )
    await updateClipboard(content, deviceId)
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }
