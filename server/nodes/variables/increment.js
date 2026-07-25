const { string, number } = require('../../utils/inputParser')
const { getVar, setVar } = require('../../utils/vars')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Name", "string");
        this.addProperty("Name", "");
        this.addInput("Amount", "number");
        this.addProperty("Amount", "1");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Value", "number");
    }
}
NodeDefinition.prototype.title = "Variables/Increment"
NodeDefinition.prototype.description = "Reads a named global variable as a number, adds an amount (default 1), stores it, and outputs the new value."
NodeDefinition.prototype.color = "blue"
NodeDefinition.prototype.icon = "exposure_plus_1"
const NodeFunction = async (node, params, behaviors) => {
    const name = string(params.Name);
    const current = parseFloat(getVar(name));
    const next = (Number.isFinite(current) ? current : 0) + number(params.Amount);
    setVar(name, String(next));
    await behaviors.populateNextNodeLinks([null, next]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0] || []);
    return true;
}
module.exports = { NodeDefinition, NodeFunction }
