const { log, logColors } = require('../../log')
const { number, string, bool, json } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Array", "array");
        this.addInput("index", "number")
        this.addProperty("index", "0")
        this.addOutput("", "object");
    }
}
NodeDefinition.prototype.title = "JSON/Get Array Item"
NodeDefinition.prototype.description = "Returns the element at a given index from a JSON array as a JSON string, or an empty object if the index is out of range."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Array: {"description":"Input \"Array\" for Get Array Item.","structure":"JSON array (may be serialized as a string in some nodes).","required":true},
		index: {"description":"Input \"index\" for Get Array Item.","structure":"Numeric value (integer or float).","required":true},
	},
	outputs: {
		"": {"description":"Primary output of Get Array Item.","structure":"JSON object; may be returned as a parsed object or JSON string depending on the node.","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_array"
const NodeFunction = async (node, params, behaviors) => {
    try {
        const array = json(params["Array"])
        const index = number(params.index)
        if (index < array.length && index >= 0)
            await behaviors.populateNextNodeLinks([JSON.stringify(array[index])]);
        else
            await behaviors.populateNextNodeLinks(["{}"]);
        return true
    }
    catch {
        await behaviors.populateNextNodeLinks(["{}"]);
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }