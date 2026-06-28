const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addInput("Base", "number");
        this.addProperty("Base", "10");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Log"
NodeDefinition.prototype.description = "Computes the logarithm of A with a configurable base (default 10)."
NodeDefinition.prototype.portMeta = {
	inputs: {
		A: {"description":"Input \"A\" for Log.","structure":"Numeric value (integer or float).","required":true},
		Base: {"description":"Input \"Base\" for Log.","structure":"Numeric value (integer or float).","required":false},
	},
	outputs: {
		"": {"description":"Primary output of Log.","structure":"Numeric value (integer or float).","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.bigText = "log"
NodeDefinition.prototype.title_mode = "LiteGraph.NO_TITLE"
NodeDefinition.prototype.collapsible = "false"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([ Math.log(number(params.A)) / Math.log(number(params.Base)) ]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }