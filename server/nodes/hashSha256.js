const { log, logColors } = require('../log')
const { number, string, bool } = require('../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Text", "string");
        this.addOutput("Hash", "string");
        this.desc = "Generates a SHA-256 hash of the input text.";
    }
}
NodeDefinition.prototype.title = "Hash/SHA-256"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "tag"
const { createHash } = require('crypto');
const NodeFunction = async (node, params, behaviors) => {
    try  {
        await behaviors.populateNextNodeLinks([createHash('sha256').update(string(params.Text)).digest('base64')]);
        return true
    }
    catch (e) {
        log(`Error in sha256: ${e}`, logColors.Error)
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }