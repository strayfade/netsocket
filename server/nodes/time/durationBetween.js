const { string } = require('../../utils/inputParser')
const { durationBetween } = require('../../utils/timeTools')

class NodeDefinition {
    constructor() {
        this.addInput("Start", "number");
        this.addProperty("Start", "0");
        this.addInput("End", "number");
        this.addProperty("End", "0");
        this.addInput("Unit", "string");
        this.addEnumProperty("Unit", "ms", ["ms", "seconds", "minutes", "hours", "days"]);
        this.addOutput("Duration", "number");
    }
}
NodeDefinition.prototype.title = "Time/Duration Between"
NodeDefinition.prototype.description = "Computes the signed duration between two timestamps in the chosen unit."
NodeDefinition.prototype.color = "yellow"
NodeDefinition.prototype.icon = "more_time"
const NodeFunction = async (node, params, behaviors) => {
    const duration = durationBetween(params.Start, params.End, string(params.Unit));
    await behaviors.populateNextNodeLinks([Number.isFinite(duration) ? duration : 0]);
    return Number.isFinite(duration);
}
module.exports = { NodeDefinition, NodeFunction }
