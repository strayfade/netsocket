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
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_object"
const NodeFunction = async (node, params, behaviors) => {
    try {
        let parsed = json(params["JSON"])
        if (typeof parsed === "string") {
            parsed = JSON.parse(parsed)
        }
        await behaviors.populateNextNodeLinks([JSON.stringify(parsed)]);
        return true
    }
    catch (e) {
        log(`Error: ${e}`)
        await behaviors.populateNextNodeLinks(["{}"]);
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }
