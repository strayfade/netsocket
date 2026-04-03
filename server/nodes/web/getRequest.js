const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')
const axios = require('axios')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("URL", "string")
        this.addProperty("URL", "")
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Response", "string")
    }
}
NodeDefinition.prototype.title = "Web/GET Request"
NodeDefinition.prototype.color = "blue"
NodeDefinition.prototype.icon = "downloading"
const NodeFunction = async (node, params, behaviors) => {

    let webContent = await axios.get(string(io.input.URL))
    if (webContent.data)
        webContent.data = JSON.stringify(webContent.data)

    await behaviors.populateNextNodeLinks([webContent.data]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }