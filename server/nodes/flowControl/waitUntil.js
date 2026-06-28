const axios = require('axios')
const { number, string, bool } = require('../../utils/inputParser')
const { getVar } = require('../../utils/vars')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Mode", "string");
        this.addEnumProperty("Mode", "Boolean", ["Boolean", "Variable", "HTTP"]);
        this.addInput("Condition", "boolean");
        this.addEnumProperty("Condition", "False", ["True", "False"]);
        this.addInput("Variable Name", "string");
        this.addProperty("Variable Name", "");
        this.addInput("Expected Value", "string");
        this.addProperty("Expected Value", "");
        this.addInput("URL", "string");
        this.addProperty("URL", "");
        this.addInput("Expected Status", "number");
        this.addProperty("Expected Status", "200");
        this.addInput("Poll Interval (ms)", "number");
        this.addProperty("Poll Interval (ms)", "1000");
        this.addInput("Max Wait (ms)", "number");
        this.addProperty("Max Wait (ms)", "30000");
        this.addOutput("Success", LiteGraph.EVENT);
        this.addOutput("Timeout", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Flow Control/Wait Until"
NodeDefinition.prototype.description = "Polls until a condition becomes true or a timeout is reached, checking a boolean, a named variable value, or an HTTP URL status code. Fires Success when the condition is met or Timeout when it is not."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Mode: {"description":"Input \"Mode\" for Wait Until.","structure":"Plain text string (UTF-8).","required":false},
		Condition: {"description":"Input \"Condition\" for Wait Until.","structure":"Boolean true or false.","required":true},
		"Variable Name": {"description":"Input \"Variable Name\" for Wait Until.","structure":"Plain text string (UTF-8).","required":true},
		"Expected Value": {"description":"Input \"Expected Value\" for Wait Until.","structure":"Plain text string (UTF-8).","required":true},
		URL: {"description":"Request target URL.","structure":"HTTP or HTTPS URL string.","required":true},
		"Expected Status": {"description":"Input \"Expected Status\" for Wait Until.","structure":"Numeric value (integer or float).","required":false},
		"Poll Interval (ms)": {"description":"Input \"Poll Interval (ms)\" for Wait Until.","structure":"Numeric value (integer or float).","required":false},
		"Max Wait (ms)": {"description":"Input \"Max Wait (ms)\" for Wait Until.","structure":"Numeric value (integer or float).","required":false},
	},
	outputs: {
		Success: {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Timeout: {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "hourglass_top"

const checkCondition = async (mode, params) => {
    switch (string(mode).toLowerCase()) {
        case 'boolean':
            return bool(params.Condition)
        case 'variable': {
            const name = string(params["Variable Name"])
            if (!name) return false
            return getVar(name) === string(params["Expected Value"])
        }
        case 'http': {
            const url = string(params.URL)
            if (!url) return false
            const response = await axios.get(url, { validateStatus: () => true })
            return response.status === number(params["Expected Status"])
        }
        default:
            return false
    }
}

const NodeFunction = async (node, params, behaviors) => {
    const pollInterval = Math.max(100, number(params["Poll Interval (ms)"]))
    const maxWait = Math.max(pollInterval, number(params["Max Wait (ms)"]))
    const mode = string(params.Mode)
    const started = Date.now()

    while (Date.now() - started <= maxWait) {
        try {
            if (await checkCondition(mode, params)) {
                await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
                return true
            }
        } catch {
            // keep polling until timeout
        }

        if (Date.now() - started + pollInterval > maxWait) {
            break
        }

        await sleep(pollInterval)
    }

    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[1]);
    return false
}

module.exports = { NodeDefinition, NodeFunction }
