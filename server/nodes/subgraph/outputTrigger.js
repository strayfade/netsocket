class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addProperty("Name", "Done");
    }
}
NodeDefinition.prototype.title = "Subgraph/Output Trigger"
NodeDefinition.prototype.description = "Fires a named event output on the enclosing Call node. Use Name to choose which Call event port to trigger, and wire this when that branch should continue outside the subgraph."
NodeDefinition.prototype.portMeta = {
    inputs: {
        "": {
            description: "When triggered, fires the matching named event output on the Call node.",
            structure: "Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.",
            mcpOmit: true,
        },
    },
}
NodeDefinition.prototype.color = "cyan"
NodeDefinition.prototype.icon = "logout"

const NodeFunction = async (properties, params, behaviors) => {
    const name = String(properties?.Name || "Done").trim() || "Done"
    const emitter = behaviors?.__executeOptions?.subgraphEventEmitter
    if (typeof emitter === "function") {
        await emitter(name)
    }
}

module.exports = { NodeDefinition, NodeFunction }
