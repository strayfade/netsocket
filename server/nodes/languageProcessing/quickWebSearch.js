const { string } = require('../../utils/inputParser')
const { quickWebSearch } = require('../../utils/quickWebSearch')
const { DEFAULT_MODEL } = require('../../utils/languageModel')

class NodeDefinition {
    constructor() {
        this.addInput('', LiteGraph.EVENT)
        this.addInput('Query', 'string')
        this.addInput('Model', 'string')
        this.addProperty('Query', '')
        this.addProperty('Model', DEFAULT_MODEL)
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
		Model: {"description":"Language model name or ID.","structure":"Model identifier string (provider-specific).","required":false},
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
    const model = string(params.Model)

    const { response, error } = await quickWebSearch(query, { model })
    const output = error ? '' : response

    await behaviors.populateNextNodeLinks([null, output])
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0])
    return !error
}

module.exports = { NodeDefinition, NodeFunction }
