const { log, logColors } = require('../../log')
const { number, string, bool, json } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("JSON", "string");
        this.addProperty("JSON", "{}");
        this.addInput("Key Name", "string");
        this.addInput("New Item", "string");
        this.addOutput("", "string");
    }
}
NodeDefinition.prototype.title = "JSON/Set Object Value"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_object"
const NodeFunction = async (node, params, behaviors) => {
    try {
        let object = json(params["JSON"])
        object[string(params["Key Name"])] = string(params["New Item"])
        await behaviors.populateNextNodeLinks([ JSON.stringify(object) ]);
        return true
    }
    catch (e) {
        log(e)
        await behaviors.populateNextNodeLinks([ "" ]);
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }