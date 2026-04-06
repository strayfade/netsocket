const vm = require('vm')
const { string } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Code", "string");
        this.addProperty("Code", "");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Result", "string");
    }
}

NodeDefinition.prototype.title = "Debugging/Run Javascript"
NodeDefinition.prototype.color = "blue"
NodeDefinition.prototype.icon = "terminal"

const resultToString = (value) => {
    if (typeof value === 'string') return value
    if (value === undefined) return "undefined"
    if (value === null) return "null"

    try {
        return JSON.stringify(value)
    }
    catch {
        return String(value)
    }
}

const NodeFunction = async (node, params, behaviors) => {
    let result

    try {
        result = vm.runInNewContext(string(params["Code"]), {}, { timeout: 1000 })
    }
    catch (error) {
        result = `Error: ${error.message}`
    }

    await behaviors.populateNextNodeLinks([resultToString(result)]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}

module.exports = { NodeDefinition, NodeFunction }
