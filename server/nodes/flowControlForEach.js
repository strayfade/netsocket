const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Array", "array");
        this.addInput("Delay (ms)", "number");
        this.addOutput("On Element", LiteGraph.EVENT);
        this.addOutput("Element", "string")
        this.addOutput("Index", "number")
        this.addOutput("On Finish", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Flow Control/For Each"
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "data_array"
const NodeFunction = async (node, params, behaviors) => {
    try {
        const array = JSON.parse(string(params.Array))
        for (i in array) {
            const currentElement = JSON.stringify(array[i]).toString()
            const currentIndex = i;
            await behaviors.populateNextNodeLinks([
                null, currentElement, currentIndex, null
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