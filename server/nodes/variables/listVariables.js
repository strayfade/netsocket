const { getVarsSnapshot } = require('../../utils/vars')

class NodeDefinition {
    constructor() {
        this.addOutput("Variables", "array");
        this.desc = "Lists all stored variable names from server storage as a JSON array string. Use with Variables/Get Variable to read one entry."
    }
}
NodeDefinition.prototype.title = "Variables/List Variables"
NodeDefinition.prototype.description = "Lists all stored variable names as a JSON array string (e.g. [\"myVar\",\"otherVar\"]). Chain with Variables/Get Variable by extracting one name via JSON/Get Array Item."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		Variables: {"description":"Array of variable names. Parse the JSON string or use JSON/Get Array Item to extract one name before chaining to Get Variable.","structure":"JSON array string of variable names (e.g. [\"myVar\"]).","mcpKey":"Variables"},
	},
}
NodeDefinition.prototype.mcpPreferred = "Prefer for discovering available variable names before reading with Variables/Get Variable. Chain: List Variables → JSON/Get Array Item (Array=Variables, Index=0) → Get Variable (Name=that value)."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "list"
const NodeFunction = async (node, params, behaviors) => {
    const snapshot = getVarsSnapshot()
    const names = snapshot.map((entry) => entry.name)
    await behaviors.populateNextNodeLinks([JSON.stringify(names)]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }
