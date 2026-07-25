const { string, json } = require('../../utils/inputParser')
const { getByPath } = require('../../utils/arrayTools')

class NodeDefinition {
    constructor() {
        this.addInput("JSON", "object");
        this.addProperty("JSON", "{}");
        this.addInput("Path", "string");
        this.addProperty("Path", "");
        this.addOutput("Value", "object");
    }
}
NodeDefinition.prototype.title = "JSON/Get By Path"
NodeDefinition.prototype.description = "Looks up a nested value using a dotted path with optional array indexes, for example user.address.city or items[0].id."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "data_object"
const NodeFunction = async (node, params, behaviors) => {
    const value = getByPath(json(params.JSON), string(params.Path));
    await behaviors.populateNextNodeLinks([value === undefined ? null : value]);
    return value !== undefined;
}
module.exports = { NodeDefinition, NodeFunction }
