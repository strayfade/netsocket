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
