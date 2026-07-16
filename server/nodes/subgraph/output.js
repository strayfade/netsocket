class NodeDefinition {
    constructor() {
        this.addProperty("Name", "output");
        this.addEnumProperty("Type", "string", ["string", "number", "boolean", "array", "object", "*"]);
        this.addInput("Value", "*");
        this.addProperty("Value", "");
    }
}
NodeDefinition.prototype.title = "Subgraph/Output"
NodeDefinition.prototype.description = "Defines a named data output for this subgraph. The Call node exposes a matching output port."
NodeDefinition.prototype.portMeta = {
    inputs: {
        Value: {
            description: "Value collected as this subgraph's matching output on the Call node.",
            structure: "Same type as the Type property (string, number, boolean, array, object, or any).",
            required: false,
        },
    },
}
NodeDefinition.prototype.color = "cyan"
NodeDefinition.prototype.icon = "logout"

const NodeFunction = async () => true

module.exports = { NodeDefinition, NodeFunction }
