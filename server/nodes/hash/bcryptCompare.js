const bcrypt = require('bcrypt')
const { string } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Data", "string");
        this.addInput("Hash", "string");
        this.addOutput("Match", "boolean");
    }
}
NodeDefinition.prototype.title = "Hash/bcrypt Compare"
NodeDefinition.prototype.description = "Compares plaintext data against a bcrypt hash and outputs whether they match."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "verified_user"
const NodeFunction = async (node, params, behaviors) => {
    try {
        const match = await bcrypt.compare(string(params.Data), string(params.Hash));
        await behaviors.populateNextNodeLinks([match]);
        return match;
    } catch (e) {
        await behaviors.populateNextNodeLinks([false]);
        return false;
    }
}
module.exports = { NodeDefinition, NodeFunction }
