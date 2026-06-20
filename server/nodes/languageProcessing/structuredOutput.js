const { string } = require('../../utils/inputParser')
const { askAIStructured } = require('../../utils/structuredOutput')

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
        this.addProperty("Model", "lfm2.5");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Object", "string");
        this.addOutput("Error", "string");
    }
}
NodeDefinition.prototype.title = "Language Processing/Structured Output LLM"
NodeDefinition.prototype.description = "Asks an LLM to return JSON matching a provided schema and outputs the parsed object string or an error message. Makes an external LLM API call."
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
