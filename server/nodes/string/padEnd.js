const { string, number } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addInput("Length", "number");
        this.addProperty("Length", "2");
        this.addInput("Fill", "string");
        this.addProperty("Fill", " ");
        this.addOutput("Text", "string");
    }
}
NodeDefinition.prototype.title = "String/Pad End"
NodeDefinition.prototype.description = "Pads the end of a string to a target length using a fill character."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "format_align_right"
const NodeFunction = async (node, params, behaviors) => {
    const fill = string(params.Fill) || " ";
    await behaviors.populateNextNodeLinks([string(params.String).padEnd(Math.max(0, Math.trunc(number(params.Length))), fill)]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
