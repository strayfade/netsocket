const { string } = require('../../utils/inputParser')
const { deepResearch } = require('../../utils/deepResearch')
const { DEFAULT_MODEL } = require('../../utils/languageModel')

class NodeDefinition {
    constructor() {
        this.addInput('', LiteGraph.EVENT)
        this.addInput('Question', 'string')
        this.addInput('Model', 'string')
        this.addProperty('Question', '')
        this.addProperty('Model', DEFAULT_MODEL)
        this.addOutput('', LiteGraph.EVENT)
        this.addOutput('Answer', 'string')
        this.desc = 'Searches the web, reads each result as plain text, and uses an LLM to form a consensus answer with cited sources.'
    }
}
NodeDefinition.prototype.title = 'Language Processing/Deep Research LLM'
NodeDefinition.prototype.description = "Searches the web for a question, reads result pages, and uses an LLM to synthesize a consensus answer with cited sources. Makes external HTTP and LLM API calls."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Question: {"description":"Input \"Question\" for Deep Research LLM.","structure":"Plain text string (UTF-8).","required":true},
		Model: {"description":"Language model name or ID.","structure":"Model identifier string (provider-specific).","required":false},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Answer: {"description":"Answer produced by Deep Research LLM.","structure":"Plain text string (UTF-8).","mcpKey":"Answer"},
	},
}
NodeDefinition.prototype.color = 'blue'
NodeDefinition.prototype.icon = 'travel_explore'

const NodeFunction = async (node, params, behaviors) => {
    const question = string(params.Question)
    const model = string(params.Model)

    const { answer, error } = await deepResearch(question, { model })
    const output = error ? '' : answer

    await behaviors.populateNextNodeLinks([null, output])
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0])
    return !error
}

module.exports = { NodeDefinition, NodeFunction }
