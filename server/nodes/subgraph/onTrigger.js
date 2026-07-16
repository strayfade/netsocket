class NodeDefinition {
    constructor() {
        this.addOutput("", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Subgraph/On Trigger"
NodeDefinition.prototype.description = "Fires when the parent subgraph Call node is triggered. Connect this to start the inner flow."
NodeDefinition.prototype.portMeta = {
    outputs: {
        "": {
            description: "Event fired when the enclosing subgraph Call runs.",
            structure: "Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.",
            mcpOmit: true,
        },
    },
}
NodeDefinition.prototype.color = "cyan"
NodeDefinition.prototype.icon = "play_arrow"

const NodeFunction = async (node, params, behaviors) => {
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0])
}

module.exports = { NodeDefinition, NodeFunction }
