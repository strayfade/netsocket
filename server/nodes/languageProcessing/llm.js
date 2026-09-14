const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')
const { askAI } = require('../../utils/languageModel')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Prompt", "string");
        this.addInput("System Prompt", "string");
        this.addInput("Provider", "string");
        this.addProperty("Provider", "");
        this.addInput("Model", "string");
        this.addProperty("Model", "");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Response", "string");
        this.desc = "Uses a large language model to process natural language."
    }
}
NodeDefinition.prototype.title = "Language Processing/LLM"
NodeDefinition.prototype.description = "Sends a prompt and optional system prompt to a configurable language model and outputs the text response. Makes an external LLM API call."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Prompt: {"description":"Main prompt sent to the model.","structure":"Natural-language prompt text.","required":true},
		"System Prompt": {"description":"System instructions for the model.","structure":"System/instruction prompt text.","required":true},
		Provider: {"description":"AI provider ID. Leave empty to use the default provider.","structure":"Provider identifier string; use AI Providers settings to manage providers.","required":false},
		Model: {"description":"Language model name or ID. Leave empty to use the default model for the selected provider.","structure":"Model identifier string (provider-specific).","required":false},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Response: {"description":"Primary text output.","structure":"Text response from the operation.","mcpKey":"Response"},
	},
}
NodeDefinition.prototype.color = "blue"
NodeDefinition.prototype.icon = "network_intelligence"
const NodeFunction = async (node, params, behaviors) => {
    params["Prompt"] = string(params["Prompt"])
    params["System Prompt"] = string(params["System Prompt"])
    params["Provider"] = string(params["Provider"])
    params["Model"] = string(params["Model"])
    let output = await askAI(params["Prompt"], params["System Prompt"], params["Model"], params["Provider"])
    await behaviors.populateNextNodeLinks([null, output]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }