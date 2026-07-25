const { json } = require('../../utils/inputParser')
const { arrayIncludes } = require('../../utils/arrayTools')

class NodeDefinition {
    constructor() {
        this.addInput("Array", "array");
        this.addProperty("Array", "[]");
        this.addInput("Value", "string");
        this.addProperty("Value", "");
        this.addOutput("", "boolean");
    }
}
NodeDefinition.prototype.title = "JSON/Array Includes"
NodeDefinition.prototype.description = "Outputs true if the array contains the given value."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "checklist"
const NodeFunction = async (node, params, behaviors) => {
    let value = params.Value;
    try {
        if (typeof value === "string" && (value.trim().startsWith("{") || value.trim().startsWith("["))) {
            value = json(value);
        }
    } catch (_) {}
    await behaviors.populateNextNodeLinks([arrayIncludes(json(params.Array), value)]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
