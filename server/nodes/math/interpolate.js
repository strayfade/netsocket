const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("A", "number");
        this.addInput("B", "number");
        this.addInput("Alpha", "number");
        this.addProperty("Alpha", "0.5");
        this.addOutput("", "number");
    }
}
NodeDefinition.prototype.title = "Math/Interpolate"
NodeDefinition.prototype.description = "Linearly interpolates between A and B using Alpha (0–1) as the blend factor."
NodeDefinition.prototype.portMeta = {
	inputs: {
		A: {"description":"Input \"A\" for Interpolate.","structure":"Numeric value (integer or float).","required":true},
		B: {"description":"Input \"B\" for Interpolate.","structure":"Numeric value (integer or float).","required":true},
		Alpha: {"description":"Input \"Alpha\" for Interpolate.","structure":"Numeric value (integer or float).","required":false},
	},
	outputs: {
		"": {"description":"Primary output of Interpolate.","structure":"Numeric value (integer or float).","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
const lerp = (a, b, alpha) => {
    return (b - a) * alpha + a
}
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([lerp(number(params.A), number(params.B), number(params.Alpha))]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }