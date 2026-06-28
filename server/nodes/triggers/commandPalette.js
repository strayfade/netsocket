const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')
require('../../manager/nodePreferencesRegistry').addPref(
    'Command Palette',
    'triggersCommandPalette.secret',
    'Command Palette Secret Key',
    'text',
    '',
    'A secret key used to authenticate connections from the command palette to netsocket.'
);
class NodeDefinition {
    constructor() {
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Content", "string")
        this.addOutput("Conversation ID", "string")
    }
}
NodeDefinition.prototype.title = "Triggers/Command Palette"
NodeDefinition.prototype.description = "Triggers when a command is received from the authenticated command palette integration. Outputs the command content and conversation ID."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Content: {"description":"Content produced by Command Palette.","structure":"Plain text string (UTF-8).","mcpKey":"Content"},
		"Conversation ID": {"description":"Conversation ID produced by Command Palette.","structure":"Plain text string (UTF-8).","mcpKey":"Conversation ID"},
	},
}
NodeDefinition.prototype.color = "black"
NodeDefinition.prototype.icon = "input"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([
        null,
        string(params["Content"]),
        string(params["Conversation ID"])
    ]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }