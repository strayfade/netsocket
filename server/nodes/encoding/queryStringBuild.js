const { json } = require('../../utils/inputParser')
const { buildQueryString } = require('../../utils/encodingTools')

class NodeDefinition {
    constructor() {
        this.addInput("Object", "object");
        this.addProperty("Object", "{}");
        this.addOutput("Query", "string");
    }
}
NodeDefinition.prototype.title = "Encoding/Query String Build"
NodeDefinition.prototype.description = "Builds a URL query string from a JSON object of keys and values."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "link"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([buildQueryString(json(params.Object))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
