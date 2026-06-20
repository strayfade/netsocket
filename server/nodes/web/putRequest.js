const { log, logColors } = require('../../log')
const { string } = require('../../utils/inputParser')
const { performWebRequest } = require('../../utils/httpRequest')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("URL", "string")
        this.addProperty("URL", "")
        this.addInput("Body", "string")
        this.addProperty("Body", "{}")
        this.addInput("Content Type", "string")
        this.addEnumProperty("Content Type", "application/json", [
            "application/json",
            "application/x-www-form-urlencoded",
            "text/plain",
            "text/html",
            "application/xml",
            "application/octet-stream",
        ])
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Response", "string")
        this.addOutput("Status", "number")
    }
}
NodeDefinition.prototype.title = "Web/PUT Request"
NodeDefinition.prototype.description = "Sends an HTTP PUT request with a configurable body and content type, outputting the response body and status code."
NodeDefinition.prototype.color = "blue"
NodeDefinition.prototype.icon = "upload"

const NodeFunction = async (node, params, behaviors) => {
    try {
        const result = await performWebRequest('PUT', params.URL, {
            body: params.Body,
            contentType: params["Content Type"],
        })
        await behaviors.populateNextNodeLinks([null, result.body, result.status]);
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
        return true
    } catch (error) {
        log(`PUT request failed: ${error.message}`, logColors.Error)
        await behaviors.populateNextNodeLinks([null, "", 0]);
        return false
    }
}

module.exports = { NodeDefinition, NodeFunction }
