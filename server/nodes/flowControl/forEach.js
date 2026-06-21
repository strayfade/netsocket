const { log, logColors } = require('../../log')
const { number, string, bool, json } = require('../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Array", "array");
        this.addInput("Delay (ms)", "number");
        this.addOutput("On Element", LiteGraph.EVENT);
        this.addOutput("Element", "object")
        this.addOutput("Index", "number")
        this.addOutput("On Finish", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Flow Control/For Each"
NodeDefinition.prototype.description = "Iterates over a JSON array, firing On Element with each item as a JSON object and its index, then fires On Finish when done."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "data_array"
const NodeFunction = async (node, params, behaviors) => {
    try {
        const array = json(params.Array)
        if (!Array.isArray(array))
            throw new Error('Array input must be a JSON array')
        for (let i = 0; i < array.length; i++) {
            const currentElement = array[i]
            await behaviors.populateNextNodeLinks([
                null, currentElement, i, null
            ]);
            await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
            if (i < array.length - 1)
                await new Promise(resolve => setTimeout(resolve, number(params["Delay (ms)"])));
        }
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[3]);
    }
    catch (e) {
        log(`Error: ${e}`, logColors.Error)
        return false
    }
    return true
}
module.exports = { NodeDefinition, NodeFunction }