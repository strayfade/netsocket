const { number, string } = require('../../utils/inputParser')
const { isBusinessHours } = require('../../utils/timeTools')

class NodeDefinition {
    constructor() {
        this.addInput("Timestamp", "number");
        this.addProperty("Timestamp", "0");
        this.addInput("Start Hour", "number");
        this.addProperty("Start Hour", "9");
        this.addInput("End Hour", "number");
        this.addProperty("End Hour", "17");
        this.addInput("Weekdays", "string");
        this.addEnumProperty("Weekdays", "1,2,3,4,5", [
            "1,2,3,4,5",
            "1,2,3,4,5,6",
            "0,1,2,3,4,5,6",
            "0,6",
        ]);
        this.addInput("Time Zone", "string");
        this.addProperty("Time Zone", "UTC");
        this.addOutput("Open", "boolean");
    }
}
NodeDefinition.prototype.title = "Time/Business Hours"
NodeDefinition.prototype.description = "Checks whether a timestamp falls within configured business hours, weekdays, and time zone, outputting true if open."
NodeDefinition.prototype.color = "yellow"
NodeDefinition.prototype.icon = "work_history"

const NodeFunction = async (node, params, behaviors) => {
    const timestamp = number(params.Timestamp)
    const open = isBusinessHours(timestamp > 0 ? timestamp : Date.now(), {
        startHour: number(params["Start Hour"]),
        endHour: number(params["End Hour"]),
        weekdays: string(params.Weekdays),
        timeZone: string(params["Time Zone"]),
    })
    await behaviors.populateNextNodeLinks([open]);
    return true
}

module.exports = { NodeDefinition, NodeFunction }
