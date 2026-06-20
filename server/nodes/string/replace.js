const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Original", "string");
        this.addInput("Search for", "string");
        this.addInput("Replace with", "string");
        this.addInput("Replace all", "boolean");
        this.addEnumProperty("Replace all", "True", ["True", "False"]);
        this.addOutput("Output", "string");
    }
}
NodeDefinition.prototype.title = "String/Replace"
NodeDefinition.prototype.description = "Finds a substring in the original text and replaces it with new text, optionally replacing all occurrences."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "sync_alt"
const NodeFunction = async (node, params, behaviors) => {
    params["Original"] = string(params["Original"])
    params["Replace with"] = string(params["Replace with"])
    params["Search for"] = string(params["Search for"])
    if (bool(params["Replace all"])) {
        for (let i = 0; i < params["Original"].length; i++) {
            params["Original"] = params["Original"].replace(params["Search for"], params["Replace with"])
        }
    }
    else {
        params["Original"] = params["Original"].replace(params["Search for"], params["Replace with"])
    }
    await behaviors.populateNextNodeLinks([params["Original"]]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }