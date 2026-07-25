const { log, logColors } = require('../../log')
const { number } = require('../../utils/inputParser')
const { performWebRequest, parseHeadersInput } = require('../../utils/httpRequest')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("URL", "string")
        this.addProperty("URL", "")
        this.addInput("Headers", "object")
        this.addProperty("Headers", "{}")
        this.addInput("Timeout Ms", "number")
        this.addProperty("Timeout Ms", "30000")
        this.addInput("Retries", "number")
        this.addProperty("Retries", "0")
        this.addOutput("Success", LiteGraph.EVENT);
        this.addOutput("Failed", LiteGraph.EVENT);
        this.addOutput("Response", "string")
        this.addOutput("Status", "number")
    }
}
NodeDefinition.prototype.title = "Web/DELETE Request"
NodeDefinition.prototype.description = "Sends an HTTP DELETE request with optional JSON headers, timeout, and retries. Routes to Success or Failed and outputs the response body and status code."
NodeDefinition.prototype.color = "blue"
NodeDefinition.prototype.icon = "delete"

const NodeFunction = async (node, params, behaviors) => {
    try {
        const result = await performWebRequest('DELETE', params.URL, {
            headers: parseHeadersInput(params.Headers),
            timeoutMs: number(params["Timeout Ms"]),
            retries: number(params.Retries),
        })
        await behaviors.populateNextNodeLinks([null, null, result.body, result.status]);
        const groups = behaviors.getOutputNodeGroups()
        await behaviors.triggerNodeGroup(result.ok ? (groups[0] || []) : (groups[1] || []));
        return result.ok
    } catch (error) {
        log(`DELETE request failed: ${error.message}`, logColors.Error)
        await behaviors.populateNextNodeLinks([null, null, "", 0]);
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[1] || []);
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }
