const { log, logColors } = require('../../log')
const { string } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("JSON String", "string");
        this.addProperty("JSON String", "{}");
        this.addOutput("", "object");
    }
}
NodeDefinition.prototype.title = "JSON/Deserialize"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_object"
const NodeFunction = async (node, params, behaviors) => {
    try {
        const parsed = JSON.parse(string(params["JSON String"]))
        await behaviors.populateNextNodeLinks([parsed]);
        return true
    }
    catch (e) {
        log(`Error: ${e}`)
        await behaviors.populateNextNodeLinks([{}]);
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }
