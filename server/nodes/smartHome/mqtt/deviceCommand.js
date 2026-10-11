const { log, logColors } = require('../../../log')
const { string } = require('../../../utils/inputParser')
const store = require('../../../manager/smarthomeStore')
const { publishCommand } = require('../../../utils/mqttClient')
const { RAW_COMMAND, resolveCommandMessage } = require('../../../utils/smarthomeCommands')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("UniqueId", "string");
        this.addInput("Command", "string");
        this.addInput("Payload", "string");
        this.addProperty("UniqueId", "");
        this.addEnumProperty("Command", "On", ["On", "Off", "Toggle", "Open", "Close", "Stop", RAW_COMMAND]);
        this.addProperty("Payload", "");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Result", "JSON");
    }
}
NodeDefinition.prototype.title = "Smart Home/Device Command"
NodeDefinition.prototype.description = "Publishes a command to an approved smart-home device entity (switch, light, or cover). Use Raw Payload to send a custom message."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		UniqueId: {"description":"Stable entity ID to command.","structure":"Device entity unique ID string.","required":true},
		Command: {"description":"Preset command, or Raw Payload to send Payload as-is.","structure":"Command name string.","required":false},
		Payload: {"description":"Custom message for Raw Payload commands.","structure":"Plain text string (UTF-8).","required":false},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Result: {"description":"Command outcome ({ok, topic} or {ok:false, error}).","structure":"Result object.","mcpKey":"Result"},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "toggle_on"

const NodeFunction = async (node, params, behaviors) => {
    const uniqueId = string(params["UniqueId"])
    const entity = uniqueId ? store.getEntity(uniqueId) : null
    if (!entity) {
        const result = { ok: false, error: `unknown device entity: ${uniqueId || '(empty)'}` }
        await behaviors.populateNextNodeLinks([null, result])
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0] || [])
        return false
    }
    const resolved = resolveCommandMessage(entity, params["Command"], params["Payload"])
    if (!resolved.ok) {
        log(`Smart Home command rejected: ${resolved.error}`, logColors.Warning)
        await behaviors.populateNextNodeLinks([null, { ok: false, error: resolved.error }])
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0] || [])
        return false
    }
    const sent = await publishCommand(uniqueId, resolved.message)
    const result = sent.ok
        ? { ok: true, topic: sent.topic, command: string(params["Command"]) }
        : { ok: false, error: sent.error }
    await behaviors.populateNextNodeLinks([null, result])
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0] || [])
    return sent.ok
}
module.exports = { NodeDefinition, NodeFunction }
