const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')
const { runCommand } = require('../../utils/runCommand')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Command", "string");
        this.addProperty("Command", "");
        this.addInput("Working Directory", "string");
        this.addProperty("Working Directory", "");
        this.addInput("Timeout (ms)", "number");
        this.addProperty("Timeout (ms)", "30000");
        this.addInput("Use Shell", "boolean");
        this.addEnumProperty("Use Shell", "True", ["True", "False"]);
        this.addOutput("Success", LiteGraph.EVENT);
        this.addOutput("Failed", LiteGraph.EVENT);
        this.addOutput("Stdout", "string");
        this.addOutput("Stderr", "string");
        this.addOutput("Exit Code", "number");
    }
}
NodeDefinition.prototype.title = "System/Run Command"
NodeDefinition.prototype.description = "Executes a shell command with optional working directory, timeout, and shell mode. Outputs stdout, stderr, and exit code, routing to Success or Failed."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Command: {"description":"User command to execute.","structure":"Natural-language command for the agent.","required":true},
		"Working Directory": {"description":"Input \"Working Directory\" for Run Command.","structure":"Plain text string (UTF-8).","required":true},
		"Timeout (ms)": {"description":"Input \"Timeout (ms)\" for Run Command.","structure":"Numeric value (integer or float).","required":false},
		"Use Shell": {"description":"Input \"Use Shell\" for Run Command.","structure":"Boolean true or false.","required":false},
	},
	outputs: {
		Success: {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Failed: {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Stdout: {"description":"Stdout produced by Run Command.","structure":"Plain text string (UTF-8).","mcpKey":"Stdout"},
		Stderr: {"description":"Stderr produced by Run Command.","structure":"Plain text string (UTF-8).","mcpKey":"Stderr"},
		"Exit Code": {"description":"Exit Code produced by Run Command.","structure":"Numeric value (integer or float).","mcpKey":"Exit Code"},
	},
}
NodeDefinition.prototype.color = "blue"
NodeDefinition.prototype.icon = "terminal"

const NodeFunction = async (node, params, behaviors) => {
    const result = await runCommand({
        command: string(params.Command),
        cwd: string(params["Working Directory"]) || undefined,
        timeoutMs: number(params["Timeout (ms)"]),
        useShell: bool(params["Use Shell"]),
    })

    await behaviors.populateNextNodeLinks([
        null,
        null,
        result.stdout,
        result.stderr,
        result.exitCode,
    ]);

    if (result.ok) {
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
        return true
    }

    log(`Run command failed with exit code ${result.exitCode}`, logColors.Error)
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[1]);
    return false
}

module.exports = { NodeDefinition, NodeFunction }
