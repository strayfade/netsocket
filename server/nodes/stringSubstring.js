const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("Input", "string");
        this.addInput("Begin", "number");
        this.addProperty("Begin", "0");
        this.addInput("Count", "number");
        this.addProperty("Count", "-1");
        this.addOutput("Output", "string");
    }
}
NodeDefinition.prototype.title = "String/Substring"
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "content_cut"
const NodeFunction = async (node, params, behaviors) => {
    if (number(params.Count) == -1) {
        await behaviors.populateNextNodeLinks([ string(params.Input).substr(number(params.Begin)) ]);
    }
    else {
        await behaviors.populateNextNodeLinks([ string(params.Input).substr(number(params.Begin), number(params.Count)) ]);
    }
    return true
}
module.exports = { NodeDefinition, NodeFunction }