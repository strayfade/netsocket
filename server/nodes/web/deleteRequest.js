const { log, logColors } = require('../../log')
const { string } = require('../../utils/inputParser')
const { performWebRequest } = require('../../utils/httpRequest')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("URL", "string")
        this.addProperty("URL", "")
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Response", "string")
        this.addOutput("Status", "number")
    }
}
NodeDefinition.prototype.title = "Web/DELETE Request"
NodeDefinition.prototype.description = "Sends an HTTP DELETE request to a URL and outputs the response body and status code."
NodeDefinition.prototype.color = "blue"
NodeDefinition.prototype.icon = "delete"

const NodeFunction = async (node, params, behaviors) => {
    try {
        const result = await performWebRequest('DELETE', params.URL)
        await behaviors.populateNextNodeLinks([null, result.body, result.status]);
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
        return true
    } catch (error) {
        log(`DELETE request failed: ${error.message}`, logColors.Error)
        await behaviors.populateNextNodeLinks([null, "", 0]);
        return false
    }
}

module.exports = { NodeDefinition, NodeFunction }
