const { string, number } = require('../../utils/inputParser')
const { fuzzyMatchScore } = require('../../utils/stringTools')

class NodeDefinition {
    constructor() {
        this.addInput("A", "string");
        this.addProperty("A", "");
        this.addInput("B", "string");
        this.addProperty("B", "");
        this.addOutput("Score", "number");
    }
}
NodeDefinition.prototype.title = "String/Fuzzy Match"
NodeDefinition.prototype.description = "Computes a similarity score between two strings using fuzzy matching and outputs a number from 0 to 1."
NodeDefinition.prototype.portMeta = {
	inputs: {
		A: {"description":"Input \"A\" for Fuzzy Match.","structure":"Plain text string (UTF-8).","required":true},
		B: {"description":"Input \"B\" for Fuzzy Match.","structure":"Plain text string (UTF-8).","required":true},
	},
	outputs: {
		Score: {"description":"Score produced by Fuzzy Match.","structure":"Numeric value (integer or float).","mcpKey":"Score"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "compare"

const NodeFunction = async (node, params, behaviors) => {
    const score = fuzzyMatchScore(string(params.A), string(params.B))
    await behaviors.populateNextNodeLinks([score]);
    return true
}

module.exports = { NodeDefinition, NodeFunction }
