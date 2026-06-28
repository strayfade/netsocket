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
NodeDefinition.prototype.portMeta = {
	inputs: {
		Array: {"description":"Input \"Array\" for Filter Array.","structure":"JSON object; may be returned as a parsed object or JSON string depending on the node.","required":false},
		Key: {"description":"Key used for lookup or assignment.","structure":"Object key or lookup key string.","required":false},
		Value: {"description":"Data value for the operation.","structure":"Value to store or compare.","required":false},
		Operator: {"description":"Input \"Operator\" for Filter Array.","structure":"Plain text string (UTF-8).","required":false},
	},
	outputs: {
		Result: {"description":"Primary result of the node.","structure":"Computed result value.","mcpKey":"Result"},
	},
}
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
