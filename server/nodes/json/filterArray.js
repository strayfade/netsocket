const { json, string } = require('../../utils/inputParser')
const { filterArray } = require('../../utils/jsonTools')

class NodeDefinition {
    constructor() {
        this.addInput("Array", "object");
        this.addProperty("Array", "[]");
        this.addInput("Key", "string");
        this.addProperty("Key", "status");
        this.addInput("Value", "string");
        this.addProperty("Value", "active");
        this.addInput("Operator", "string");
        this.addEnumProperty("Operator", "equals", [
            "equals",
            "not equals",
            "contains",
            "exists",
            "gt",
            "gte",
            "lt",
            "lte",
        ]);
        this.addOutput("Result", "object");
    }
}
NodeDefinition.prototype.title = "JSON/Filter Array"
NodeDefinition.prototype.description = "Filters an array of objects by a key using operators such as equals, contains, exists, or numeric comparisons, returning the matching items."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "filter_list"

const NodeFunction = async (node, params, behaviors) => {
    const items = json(params.Array)
    const source = Array.isArray(items) ? items : []
    const result = filterArray(
        source,
        string(params.Key),
        string(params.Value),
        string(params.Operator)
    )
    await behaviors.populateNextNodeLinks([result]);
    return true
}

module.exports = { NodeDefinition, NodeFunction }
