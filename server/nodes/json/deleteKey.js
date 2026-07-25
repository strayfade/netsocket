const { string, json } = require('../../utils/inputParser')
const { deleteObjectKey } = require('../../utils/arrayTools')

class NodeDefinition {
    constructor() {
        this.addInput("Object", "object");
        this.addProperty("Object", "{}");
        this.addInput("Key", "string");
        this.addProperty("Key", "");
        this.addOutput("Result", "object");
    }
}
NodeDefinition.prototype.title = "JSON/Delete Key"
NodeDefinition.prototype.description = "Returns a shallow copy of an object with the named key removed."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "delete"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([deleteObjectKey(json(params.Object), string(params.Key))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
