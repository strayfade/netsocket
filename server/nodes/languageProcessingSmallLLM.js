const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Prompt", "string");
        this.addInput("System Prompt", "string");
        this.addInput("Model", "string");
        this.addProperty("Model", "gemma3:270m");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Response", "string");
        this.desc = "Uses a language model to process natural language."
    }
}
NodeDefinition.prototype.title = "Language Processing/Small LLM"
NodeDefinition.prototype.color = "blue"
NodeDefinition.prototype.icon = "network_intelligence"
const { askAI } = require('./utils/languageModel')
const NodeFunction = async (node, params, behaviors) => {
    params["Prompt"] = string(params["Prompt"])
    params["System Prompt"] = string(params["System Prompt"])
    params["Model"] = string(params["Model"])
    let output = await askAI(params["Prompt"], params["System Prompt"], params["Model"])
    await behaviors.populateNextNodeLinks([null, output]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }