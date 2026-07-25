const { number, string } = require('../../utils/inputParser')
const { subtractDuration } = require('../../utils/timeTools')

class NodeDefinition {
    constructor() {
        this.addInput("Timestamp", "number");
        this.addProperty("Timestamp", "0");
        this.addInput("Amount", "number");
        this.addProperty("Amount", "1");
        this.addInput("Unit", "string");
        this.addEnumProperty("Unit", "hours", ["ms", "seconds", "minutes", "hours", "days"]);
        this.addOutput("Timestamp", "number");
    }
}
NodeDefinition.prototype.title = "Time/Subtract Duration"
NodeDefinition.prototype.description = "Subtracts a duration (ms, seconds, minutes, hours, or days) from a timestamp."
NodeDefinition.prototype.color = "yellow"
NodeDefinition.prototype.icon = "timelapse"
const NodeFunction = async (node, params, behaviors) => {
    const base = number(params.Timestamp);
    const timestamp = subtractDuration(base > 0 ? base : Date.now(), number(params.Amount), string(params.Unit));
    await behaviors.populateNextNodeLinks([Number.isFinite(timestamp) ? timestamp : 0]);
    return Number.isFinite(timestamp);
}
module.exports = { NodeDefinition, NodeFunction }
