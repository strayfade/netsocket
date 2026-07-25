const { string } = require('../../utils/inputParser')
const { regexMatch } = require('../../utils/stringTools')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addProperty("String", "");
        this.addInput("Regex", "string");
        this.addProperty("Regex", "(.*)");
        this.addInput("Flags", "string");
        this.addProperty("Flags", "");
        this.addOutput("Matched", "boolean");
        this.addOutput("Match", "string");
        this.addOutput("Groups", "array");
    }
}
NodeDefinition.prototype.title = "String/Regex Match"
NodeDefinition.prototype.description = "Matches a regular expression against text and outputs whether it matched, the full match, and capture groups as a JSON array."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "regular_expression"
const NodeFunction = async (node, params, behaviors) => {
    const result = regexMatch(string(params.String), string(params.Regex), string(params.Flags));
    await behaviors.populateNextNodeLinks([result.matched, result.match, result.groups]);
    return result.matched;
}
module.exports = { NodeDefinition, NodeFunction }
