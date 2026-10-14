const { log, logColors } = require('../../log')
const { string, number, bool } = require('../../utils/inputParser')
const { getAriaSettings, resolveAriaConnection, runAriaAction } = require('../../utils/aria')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Action", "string");
        this.addEnumProperty("Action", "Chat", ["Chat", "List Models", "List Chats", "Get Chat", "List Automations", "Create Automation", "Get Automation", "Update Automation", "Delete Automation", "Run Automation", "Automation Runs", "List MCP Servers"]);
        this.addInput("Message", "string");
        this.addProperty("Message", "");
        this.addInput("Messages", "string");
        this.addProperty("Messages", "");
        this.addInput("Preset", "string");
        this.addEnumProperty("Preset", "balanced", ["ping", "short", "compact", "balanced", "detailed", "extended"]);
        this.addInput("Response Format", "string");
        this.addEnumProperty("Response Format", "markdown", ["markdown", "plaintext"]);
        this.addInput("Max Tokens", "number");
        this.addProperty("Max Tokens", "");
        this.addInput("Max Iterations", "number");
        this.addProperty("Max Iterations", "");
        this.addInput("Tool Timeout Ms", "number");
        this.addProperty("Tool Timeout Ms", "");
        this.addInput("Include Tool Calls", "boolean");
        this.addEnumProperty("Include Tool Calls", "True", ["True", "False"]);
        this.addInput("Include Tool Results", "boolean");
        this.addEnumProperty("Include Tool Results", "True", ["True", "False"]);
        this.addInput("Chat ID", "string");
        this.addProperty("Chat ID", "");
        this.addInput("Automation ID", "string");
        this.addProperty("Automation ID", "");
        this.addInput("Name", "string");
        this.addProperty("Name", "");
        this.addInput("Schedule Type", "string");
        this.addEnumProperty("Schedule Type", "interval", ["interval", "cron"]);
        this.addInput("Interval Minutes", "number");
        this.addProperty("Interval Minutes", "");
        this.addInput("Cron Expression", "string");
        this.addProperty("Cron Expression", "");
        this.addInput("Enabled", "boolean");
        this.addEnumProperty("Enabled", "True", ["True", "False"]);
        this.addInput("Retention Runs", "number");
        this.addProperty("Retention Runs", "");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Response", "string");
        this.addOutput("Tool Calls", "string");
        this.addOutput("Error", "string");
    }
}
NodeDefinition.prototype.title = "Language Processing/Aria"
NodeDefinition.prototype.description = "Sends prompts to a connected Aria instance (agent gateway with MCP tool-calling) and outputs the reply text. Covers the full Aria external API: chat with response-length presets, saved chats, automations, models and MCP-server status. Makes an external HTTP API call to the configured Aria host."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Action: {"description":"Aria API operation to run. Chat sends a prompt; the rest read or manage saved chats, automations, models and MCP servers.","structure":"One of: Chat, List Models, List Chats, Get Chat, List Automations, Create Automation, Get Automation, Update Automation, Delete Automation, Run Automation, Automation Runs, List MCP Servers.","required":true},
		Message: {"description":"Chat message for the Chat action, or automation prompt for Create/Update Automation.","structure":"Natural-language prompt text (chat messages are limited to 50,000 chars).","required":false},
		Messages: {"description":"Optional full conversation history for the Chat action; overrides Message when set.","structure":"JSON array of { role, content } entries, roles user|assistant|system, up to 200 entries.","required":false},
		Preset: {"description":"Response length/verbosity preset. ping = one sentence (wearables), short = 1-2 sentences, compact = brief, balanced = default, detailed = multi-paragraph, extended = long-form.","structure":"One of: ping, short, compact, balanced, detailed, extended.","required":false},
		"Response Format": {"description":"Reply text style. plaintext strips all markdown (glasses, watches, voice).","structure":"markdown (default) or plaintext.","required":false},
		"Max Tokens": {"description":"Optional override of the preset output-token cap (1-8000). Empty = preset default.","structure":"Positive integer or empty.","required":false},
		"Max Iterations": {"description":"Optional cap on Aria tool steps for the Chat action. Empty = Aria default.","structure":"Positive integer or empty.","required":false},
		"Tool Timeout Ms": {"description":"Optional per-tool timeout in milliseconds for the Chat action. Empty = Aria default (30000).","structure":"Positive integer or empty.","required":false},
		"Include Tool Calls": {"description":"False hides tool-call traces so only assistant text is returned.","structure":"True (default) or False.","required":false},
		"Include Tool Results": {"description":"False keeps tool names/args/status but redacts successful results.","structure":"True (default) or False.","required":false},
		"Chat ID": {"description":"Saved-chat ID for the Get Chat action.","structure":"Aria chat identifier string.","required":false},
		"Automation ID": {"description":"Automation ID for Get/Update/Delete/Run/Runs actions.","structure":"Aria automation identifier string.","required":false},
		Name: {"description":"Automation name for Create Automation (or new name for Update).","structure":"Plain text string.","required":false},
		"Schedule Type": {"description":"Automation schedule kind for Create/Update Automation.","structure":"interval or cron.","required":false},
		"Interval Minutes": {"description":"Minutes between runs for interval schedules.","structure":"Positive number or empty.","required":false},
		"Cron Expression": {"description":"5-field cron (minute hour day month weekday) for cron schedules.","structure":"Cron string such as 0 9 * * *.","required":false},
		Enabled: {"description":"Whether the automation is enabled (Create/Update).","structure":"True (default) or False.","required":false},
		"Retention Runs": {"description":"How many run-history entries Aria keeps for the automation.","structure":"Positive integer or empty.","required":false},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Response: {"description":"Aria reply text (Chat) or raw JSON for list/manage actions.","structure":"Text response from the operation.","mcpKey":"Response"},
		"Tool Calls": {"description":"Tool-call trace for the Chat action as a JSON array string; empty otherwise.","structure":"JSON array string; empty when no tools ran or the action is not Chat.","mcpKey":"Tool Calls"},
		Error: {"description":"Error details when execution fails.","structure":"Error message string; empty when successful.","mcpKey":"Error"},
	},
}
NodeDefinition.prototype.color = "blue"
NodeDefinition.prototype.icon = "smart_toy"

const NodeFunction = async (node, params, behaviors) => {
    const action = string(params.Action) || 'Chat'
    const fail = async (message) => {
        log(`Aria ${action} failed: ${message}`, logColors.Error)
        await behaviors.populateNextNodeLinks([null, '', '', String(message || 'Unknown error')]);
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
        return false
    }
    const conn = resolveAriaConnection()
    if (!conn.ok) return fail(conn.error)
    const stored = getAriaSettings()
    const includeToolCallsRaw = params['Include Tool Calls']
    const includeToolResultsRaw = params['Include Tool Results']
    const inputs = {
        message: string(params.Message),
        messages: string(params.Messages),
        preset: string(params.Preset) || stored.preset,
        responseFormat: string(params['Response Format']) || 'markdown',
        maxTokens: number(params['Max Tokens']),
        maxIterations: number(params['Max Iterations']),
        toolTimeoutMs: number(params['Tool Timeout Ms']),
        includeToolCalls: includeToolCallsRaw === undefined || includeToolCallsRaw === null || includeToolCallsRaw === '' ? true : bool(includeToolCallsRaw),
        includeToolResults: includeToolResultsRaw === undefined || includeToolResultsRaw === null || includeToolResultsRaw === '' ? true : bool(includeToolResultsRaw),
        chatId: string(params['Chat ID']),
        automationId: string(params['Automation ID']),
        name: string(params.Name),
        scheduleType: string(params['Schedule Type']) || 'interval',
        intervalMinutes: number(params['Interval Minutes']),
        cronExpression: string(params['Cron Expression']),
        enabled: params.Enabled === undefined || params.Enabled === null || params.Enabled === '' ? true : bool(params.Enabled),
        retentionRuns: number(params['Retention Runs']),
    }
    let payload
    try {
        payload = await runAriaAction(action, inputs, conn)
    } catch (e) {
        return fail(e && e.message ? e.message : String(e))
    }
    let response = ''
    let toolCalls = ''
    if (action === 'Chat') {
        response = payload && typeof payload.text === 'string' ? payload.text : ''
        toolCalls = payload && payload.toolCalls !== undefined ? JSON.stringify(payload.toolCalls) : '[]'
    } else {
        try {
            response = JSON.stringify(payload === undefined ? null : payload)
        } catch {
            response = String(payload)
        }
    }
    await behaviors.populateNextNodeLinks([null, response, toolCalls, '']);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }
