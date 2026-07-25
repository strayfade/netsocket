const { string } = require('../../utils/inputParser')
const { formatTimestamp } = require('../../utils/timeTools')

class NodeDefinition {
    constructor() {
        this.addInput("Timestamp", "number");
        this.addProperty("Timestamp", "0");
        this.addInput("Pattern", "string");
        this.addProperty("Pattern", "yyyy-MM-dd HH:mm:ss");
        this.addInput("Time Zone", "string");
        this.addProperty("Time Zone", "");
        this.addOutput("Text", "string");
    }
}
NodeDefinition.prototype.title = "Time/Format"
NodeDefinition.prototype.description = "Formats a timestamp using a pattern such as yyyy-MM-dd HH:mm:ss, optionally in a named time zone."
NodeDefinition.prototype.color = "yellow"
NodeDefinition.prototype.icon = "calendar_month"
const NodeFunction = async (node, params, behaviors) => {
    const base = Number(params.Timestamp);
    const ts = Number.isFinite(base) && base > 0 ? base : Date.now();
    await behaviors.populateNextNodeLinks([formatTimestamp(ts, string(params.Pattern), string(params["Time Zone"]))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
