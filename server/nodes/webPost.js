const { log, logColors } = require('../log')
const { number, string, bool } = require('../utils/inputParser')
const axios = require('axios')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("URL", "string")
        this.addProperty("URL", "")
        this.addInput("Body", "string")
        this.addProperty("Body", "{}")
        this.addInput("Content Type", "string")
        this.addProperty("Content Type", "application/json")
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Response", "string")
    }
}
NodeDefinition.prototype.title = "Web/POST Request"
NodeDefinition.prototype.color = "blue"
NodeDefinition.prototype.icon = "arrow_upload_progress"
const NodeFunction = async (node, params, behaviors) => {

    let webContent = await axios.post(string(io.input.URL), string(io.input.Body), {
        headers: {
            'Content-Type': string(io.input["Content Type"])
        }
    })
    if (webContent.data)
        webContent.data = JSON.stringify(webContent.data)

    await behaviors.populateNextNodeLinks([webContent.data]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }