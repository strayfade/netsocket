const { string, bool } = require('../../utils/inputParser')
const { isWithinRange } = require('../../utils/timeTools')

class NodeDefinition {
    constructor() {
        this.addInput("Value", "string");
        this.addProperty("Value", "");
        this.addInput("Start", "string");
        this.addProperty("Start", "");
        this.addInput("End", "string");
        this.addProperty("End", "");
        this.addInput("Inclusive", "boolean");
        this.addEnumProperty("Inclusive", "True", ["True", "False"]);
        this.addOutput("In Range", "boolean");
    }
}
NodeDefinition.prototype.title = "Time/Is Within Range"
NodeDefinition.prototype.description = "Checks whether a date/time value falls between a start and end date, with optional inclusive boundaries."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Value: {"description":"Data value for the operation.","structure":"Value to store or compare.","required":true},
		Start: {"description":"Input \"Start\" for Is Within Range.","structure":"Plain text string (UTF-8).","required":true},
		End: {"description":"Input \"End\" for Is Within Range.","structure":"Plain text string (UTF-8).","required":true},
		Inclusive: {"description":"Input \"Inclusive\" for Is Within Range.","structure":"Boolean true or false.","required":false},
	},
	outputs: {
		"In Range": {"description":"In Range produced by Is Within Range.","structure":"Boolean true or false.","mcpKey":"In Range"},
	},
}
NodeDefinition.prototype.color = "yellow"
NodeDefinition.prototype.icon = "date_range"

const NodeFunction = async (node, params, behaviors) => {
    const inRange = isWithinRange(
        string(params.Value),
        string(params.Start),
        string(params.End),
        bool(params.Inclusive)
    )
    await behaviors.populateNextNodeLinks([inRange]);
    return true
}

module.exports = { NodeDefinition, NodeFunction }
