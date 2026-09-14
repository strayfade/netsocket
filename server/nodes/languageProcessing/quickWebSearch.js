const { string } = require('../../utils/inputParser')
const { quickWebSearch } = require('../../utils/quickWebSearch')

class NodeDefinition {
    constructor() {
        this.addInput('', LiteGraph.EVENT)
        this.addInput('Query', 'string')
        this.addInput('Provider', 'string')
        this.addProperty('Provider', '')
        this.addInput('Model', 'string')
        this.addProperty('Model', '')
        this.addProperty('Query', '')
        this.addOutput('', LiteGraph.EVENT)
        this.addOutput('Response', 'string')
        this.desc = 'Runs a fast web search on a natural language query and returns a concise LLM summary. The LLM may read individual pages when snippets are not enough.'
    }
}
NodeDefinition.prototype.title = 'Language Processing/Quick Web Search LLM'
NodeDefinition.prototype.description = 'Performs a quick web search on a natural language query and uses an LLM to return a concise answer from search snippets. The LLM can optionally read specific result pages when snippets are insufficient. Faster than Deep Research LLM because it only fetches pages on demand. Makes external HTTP and LLM API calls. Tool-capable models (e.g. llama3.2, qwen3) are required for page reads.'
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Query: {"description":"Web search query text.","structure":"Search query string.","required":true},
		Provider: {"description":"AI provider ID. Leave empty to use the default provider.","structure":"Provider identifier string.","required":false},
		Model: {"description":"Language model name or ID. Leave empty to use the default model for the selected provider.","structure":"Model identifier string (provider-specific).","required":false},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Response: {"description":"Primary text output.","structure":"Text response from the operation.","mcpKey":"Response"},
	},
}
NodeDefinition.prototype.color = 'blue'
NodeDefinition.prototype.icon = 'search'

const NodeFunction = async (node, params, behaviors) => {
    const query = string(params.Query)
    const provider = string(params.Provider)
    const model = string(params.Model)

    const { response, error } = await quickWebSearch(query, { model, providerId: provider })
    const output = error ? '' : response

    await behaviors.populateNextNodeLinks([null, output])
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0])
    return !error
}

module.exports = { NodeDefinition, NodeFunction }
