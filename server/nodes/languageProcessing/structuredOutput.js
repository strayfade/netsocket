const { string } = require('../../utils/inputParser')
const { askAIStructured } = require('../../utils/structuredOutput')
const { DEFAULT_MODEL } = require('../../utils/languageModel')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Prompt", "string");
        this.addProperty("Prompt", "");
        this.addInput("Schema", "string");
        this.addProperty("Schema", "{\"type\":\"object\",\"properties\":{\"answer\":{\"type\":\"string\"}},\"required\":[\"answer\"]}");
        this.addInput("System Prompt", "string");
        this.addProperty("System Prompt", "");
        this.addInput("Model", "string");
        this.addProperty("Model", DEFAULT_MODEL);
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Object", "string");
        this.addOutput("Error", "string");
    }
}
NodeDefinition.prototype.title = "Language Processing/Structured Output LLM"
NodeDefinition.prototype.description = "Asks an LLM to return JSON matching a provided schema and outputs the parsed object string or an error message. Makes an external LLM API call."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Prompt: {"description":"Main prompt sent to the model.","structure":"Natural-language prompt text.","required":true},
		Schema: {"description":"Schema used for validation or structured output.","structure":"JSON Schema document as a string.","required":false},
		"System Prompt": {"description":"System instructions for the model.","structure":"System/instruction prompt text.","required":true},
		Model: {"description":"Language model name or ID.","structure":"Model identifier string (provider-specific).","required":false},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Object: {"description":"Object produced by Structured Output LLM.","structure":"Plain text string (UTF-8).","mcpKey":"Object"},
		Error: {"description":"Error details when execution fails.","structure":"Error message string; empty when successful.","mcpKey":"Error"},
	},
}
NodeDefinition.prototype.color = "blue"
NodeDefinition.prototype.icon = "data_object"

const NodeFunction = async (node, params, behaviors) => {
    const result = await askAIStructured(
        string(params.Prompt),
        string(params.Schema),
        string(params["System Prompt"]),
        string(params.Model)
    )

    const objectText = result.object != null ? JSON.stringify(result.object) : ""
    await behaviors.populateNextNodeLinks([null, objectText, result.error || ""]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return result.ok
}

module.exports = { NodeDefinition, NodeFunction }
