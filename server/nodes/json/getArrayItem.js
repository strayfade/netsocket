const { log, logColors } = require('../../log')
const { number, string, bool, json } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Array", "JSON");
        this.addInput("Index", "number")
        this.addProperty("Index", "0")
        this.addOutput("", "JSON");
    }
}
NodeDefinition.prototype.title = "JSON/Get Array Item"
NodeDefinition.prototype.description = "Returns the element at a given index from a JSON array as a JSON string, or an empty object if the index is out of range."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Array: {"description":"Input \"Array\" for Get Array Item.","structure":"JSON array (may be serialized as a string in some nodes).","required":true},
		Index: {"description":"Array position to read (0 = first element). Also accepts lowercase \"index\" for backward compatibility.","structure":"Zero-based numeric index into the array.","required":true},
	},
	outputs: {
		"": {"description":"Element at Index as a JSON string (empty object \"{}\" if out of range).","structure":"JSON object or primitive serialized as JSON string depending on the array contents.","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.mcpPreferred = "Prefer for extracting a single element from a JSON array string — e.g. after Authentication/Get OTP Accounts (Accounts) or Hue Get All Lights. Pass Array as the JSON string and Index as 0-based position."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_array"
const NodeFunction = async (node, params, behaviors) => {
    try {
        const array = json(params["Array"])
        let indexValue = params["Index"] != null ? params["Index"] : params["index"]
        // Backward compat: if caller used lowercase "index" and Index is still the default "0", prefer the lowercase value
        if (params["index"] != null && String(params["Index"]) === "0" && String(params["index"]) !== String(params["Index"])) {
            indexValue = params["index"]
        }
        const index = number(indexValue)
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