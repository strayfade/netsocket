const { string } = require('../../utils/inputParser')
const { parseQueryString } = require('../../utils/encodingTools')

class NodeDefinition {
    constructor() {
        this.addInput("Query", "string");
        this.addProperty("Query", "");
        this.addOutput("Object", "object");
    }
}
NodeDefinition.prototype.title = "Encoding/Query String Parse"
NodeDefinition.prototype.description = "Parses a URL query string into a JSON object of keys and values."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "link"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([parseQueryString(string(params.Query))]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
