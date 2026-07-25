const crypto = require('node:crypto')

class NodeDefinition {
    constructor() {
        this.addOutput("UUID", "string");
    }
}
NodeDefinition.prototype.title = "String/UUID"
NodeDefinition.prototype.description = "Generates a random UUID v4 string."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "fingerprint"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([crypto.randomUUID()]);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
