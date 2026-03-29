const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')
const bcrypt = require('bcrypt')

class NodeDefinition {
    constructor() {
        this.addInput("Data", "string");
        this.addInput("Salt", "string");
        this.addOutput("Text", "string");
    }
}
NodeDefinition.prototype.title = "Hash/bcrypt"
NodeDefinition.prototype.color = "green"

const NodeFunction = async (node, params, behaviors) => {
    try  {
        await behaviors.populateNextNodeLinks([ await bcrypt.hash(string(params.Data), string(params.Salt)) ]);
        return true
    }
    catch (e) {
        log(`Error in bcrypt: ${e}`, logColors.Error)
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }