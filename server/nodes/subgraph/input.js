class NodeDefinition {
    constructor() {
        this.addProperty("Name", "input");
        this.addEnumProperty("Type", "string", ["string", "number", "boolean", "array", "object", "*"]);
        this.addOutput("Value", "*");
    }
}
NodeDefinition.prototype.title = "Subgraph/Input"
NodeDefinition.prototype.description = "Defines a named data input for this subgraph. The Call node exposes a matching input port."
NodeDefinition.prototype.portMeta = {
    outputs: {
        Value: {
            description: "Value passed in from the enclosing Call node's matching input.",
            structure: "Same type as the Type property (string, number, boolean, array, object, or any).",
        },
    },
}
NodeDefinition.prototype.color = "cyan"
NodeDefinition.prototype.icon = "login"

const NodeFunction = async (properties, params, behaviors) => {
    const value = properties && Object.prototype.hasOwnProperty.call(properties, "_value")
        ? properties._value
        : null
    await behaviors.populateNextNodeLinks([value])
}

module.exports = { NodeDefinition, NodeFunction }
