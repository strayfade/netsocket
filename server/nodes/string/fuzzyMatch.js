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
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "compare"

const NodeFunction = async (node, params, behaviors) => {
    const score = fuzzyMatchScore(string(params.A), string(params.B))
    await behaviors.populateNextNodeLinks([score]);
    return true
}

module.exports = { NodeDefinition, NodeFunction }
