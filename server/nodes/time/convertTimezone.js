const { string } = require('../../utils/inputParser')
const { convertTimezoneParts } = require('../../utils/timeTools')

class NodeDefinition {
    constructor() {
        this.addInput("Timestamp", "number");
        this.addProperty("Timestamp", "0");
        this.addInput("Time Zone", "string");
        this.addProperty("Time Zone", "UTC");
        this.addOutput("ISO Like", "string");
        this.addOutput("Parts", "object");
    }
}
NodeDefinition.prototype.title = "Time/Convert Timezone"
NodeDefinition.prototype.description = "Converts a timestamp into calendar parts and an ISO-like local string for a named IANA time zone."
NodeDefinition.prototype.color = "yellow"
NodeDefinition.prototype.icon = "language"
const NodeFunction = async (node, params, behaviors) => {
    const base = Number(params.Timestamp);
    const ts = Number.isFinite(base) && base > 0 ? base : Date.now();
    const parts = convertTimezoneParts(ts, string(params["Time Zone"]));
    if (!parts) {
        await behaviors.populateNextNodeLinks(["", {}]);
        return false;
    }
    await behaviors.populateNextNodeLinks([parts.isoLike, parts]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
