const { log, logColors } = require('../../log')
const { json } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("JSON", "object");
        this.addProperty("JSON", "{}");
        this.addOutput("", "string");
    }
}
NodeDefinition.prototype.title = "JSON/Serialize"
NodeDefinition.prototype.description = "Converts a JSON object or array into a compact JSON string."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_object"
const NodeFunction = async (node, params, behaviors) => {
    try {
        const input = params["JSON"]
        let value = input
        if (input == null || input === '')
            value = json(input)
        else if (typeof input === 'string') {
            try {
                value = JSON.parse(input)
            } catch {
                value = input
            }
        }
        await behaviors.populateNextNodeLinks([JSON.stringify(value)]);
        return true
    }
    catch (e) {
        log(`Error: ${e}`, logColors.Error)
        await behaviors.populateNextNodeLinks(["{}"]);
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }
