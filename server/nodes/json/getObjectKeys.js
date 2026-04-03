const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("JSON", "string");
        this.addProperty("JSON", "{}");
        this.addOutput("", "string");
    }
}
NodeDefinition.prototype.title = "JSON/Get Object Keys"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_object"
const NodeFunction = async (node, params, behaviors) => {
    try {
        let object = JSON.parse(string(params["JSON"]))
        await behaviors.populateNextNodeLinks([JSON.stringify(Object.keys(object))]);
        return true
    }
    catch (e) {
        log(`Error: ${e}`)
        await behaviors.populateNextNodeLinks([ JSON.stringify([]) ]);
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }