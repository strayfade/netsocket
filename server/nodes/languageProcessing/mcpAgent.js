const { string, number } = require('../../utils/inputParser')
const { runMcpAgent } = require('../../utils/mcpAgent')
const { DEFAULT_MODEL } = require('../../utils/languageModel')

class NodeDefinition {
    constructor() {
        this.addInput('', LiteGraph.EVENT)
        this.addInput('Command', 'string')
        this.addProperty('Command', '')
        this.addInput('Conversation ID', 'string')
        this.addProperty('Conversation ID', '')
        this.addInput('Memory Key', 'string')
        this.addProperty('Memory Key', 'default')
        this.addInput('Model', 'string')
        this.addProperty('Model', DEFAULT_MODEL)
        this.addInput('Max Steps', 'number')
        this.addProperty('Max Steps', 15)
        this.addInput('System Prompt', 'string')
        this.addProperty('System Prompt', '')
        this.addOutput('', LiteGraph.EVENT)
        this.addOutput('Response', 'string')
        this.addOutput('Error', 'string')
    }
}
NodeDefinition.prototype.title = 'Language Processing/MCP Agent'
NodeDefinition.prototype.description = 'Friendly Netsocket assistant with persistent local memory. Chats naturally and runs nodes via MCP tools (list_nodes, get_node_info, execute_node) when you ask it to perform actions. Requires a tool-capable Ollama model such as llama3.2 or qwen3.'
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Command: {"description":"User command to execute.","structure":"Natural-language command for the agent.","required":true},
		"Conversation ID": {"description":"Input \"Conversation ID\" for MCP Agent.","structure":"Plain text string (UTF-8).","required":true},
		"Memory Key": {"description":"Input \"Memory Key\" for MCP Agent.","structure":"Plain text string (UTF-8).","required":false},
		Model: {"description":"Language model name or ID.","structure":"Model identifier string (provider-specific).","required":false},
		"Max Steps": {"description":"Input \"Max Steps\" for MCP Agent.","structure":"Numeric value (integer or float).","required":false},
		"System Prompt": {"description":"System instructions for the model.","structure":"System/instruction prompt text.","required":true},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Response: {"description":"Primary text output.","structure":"Text response from the operation.","mcpKey":"Response"},
		Error: {"description":"Error details when execution fails.","structure":"Error message string; empty when successful.","mcpKey":"Error"},
	},
}
NodeDefinition.prototype.color = 'blue'
NodeDefinition.prototype.icon = 'smart_toy'

const NodeFunction = async (node, params, behaviors) => {
    const conversationId = string(params['Conversation ID'])
    const memoryKey = string(params['Memory Key']) || 'default'

    const result = await runMcpAgent({
        command: string(params.Command),
        model: string(params.Model),
        maxSteps: number(params['Max Steps']),
        systemPrompt: string(params['System Prompt']),
        conversationId,
        memoryKey,
    })

    await behaviors.populateNextNodeLinks([null, result.response, result.error || ''])
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0])
    return !result.error
}

module.exports = { NodeDefinition, NodeFunction }
