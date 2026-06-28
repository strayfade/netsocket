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
NodeDefinition.prototype.description = "Executes arbitrary JavaScript code in a sandboxed VM with a one-second timeout. Outputs the result as a string and continues the flow, or an error message if execution fails."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Code: {"description":"JavaScript or command text to run.","structure":"Source code or script string.","required":true},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Result: {"description":"Primary result of the node.","structure":"Computed result value.","mcpKey":"Result"},
	},
}
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

    await behaviors.populateNextNodeLinks([null, resultToString(result)]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}

module.exports = { NodeDefinition, NodeFunction }
