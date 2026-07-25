const { string, number } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("String", "string");
        this.addInput("Length", "number");
        this.addProperty("Length", "2");
        this.addInput("Fill", "string");
        this.addProperty("Fill", "0");
        this.addOutput("Text", "string");
    }
}
NodeDefinition.prototype.title = "String/Pad Start"
NodeDefinition.prototype.description = "Pads the beginning of a string to a target length using a fill character."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "format_align_left"
const NodeFunction = async (node, params, behaviors) => {
    const fill = string(params.Fill) || " ";
    await behaviors.populateNextNodeLinks([string(params.String).padStart(Math.max(0, Math.trunc(number(params.Length))), fill)]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
