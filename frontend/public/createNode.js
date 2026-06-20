const BOOLEAN_COMBO_VALUES = ["True", "False"]

const normalizeBooleanValue = (value) => {
    if (value == null || value === "") {
        return "False"
    }
    const normalized = String(value).trim().toLowerCase()
    return normalized === "true" || normalized === "1" || normalized === "yes" ? "True" : "False"
}

const ensureNumberInputProperties = (node) => {
    if (!node || !node.inputs) {
        return
    }

    for (let i = 0; i < node.inputs.length; i++) {
        const input = node.inputs[i]
        if (!input || !input.name || input.type !== "number") {
            continue
        }

        if (node.properties[input.name] === undefined) {
            node.properties[input.name] = 0
        }

        if (!node.properties_info) {
            node.properties_info = []
        }

        let info = null
        for (let j = 0; j < node.properties_info.length; j++) {
            if (node.properties_info[j].name === input.name) {
                info = node.properties_info[j]
                break
            }
        }

        if (!info) {
            node.properties_info.push({
                name: input.name,
                type: "number",
                default_value: node.properties[input.name],
            })
            continue
        }

        info.type = "number"
    }
}

const ensureBooleanInputProperties = (node) => {
    if (!node || !node.inputs) {
        return
    }

    for (let i = 0; i < node.inputs.length; i++) {
        const input = node.inputs[i]
        if (!input || !input.name || input.type !== "boolean") {
            continue
        }

        const normalized = normalizeBooleanValue(node.properties[input.name])
        node.properties[input.name] = normalized

        if (!node.properties_info) {
            node.properties_info = []
        }

        let info = null
        for (let j = 0; j < node.properties_info.length; j++) {
            if (node.properties_info[j].name === input.name) {
                info = node.properties_info[j]
                break
            }
        }

        if (!info) {
            node.properties_info.push({
                name: input.name,
                type: "enum",
                default_value: normalized,
                values: BOOLEAN_COMBO_VALUES,
            })
            continue
        }

        info.type = "enum"
        info.values = BOOLEAN_COMBO_VALUES
        if (info.default_value === undefined) {
            info.default_value = normalized
        }
    }
}

const wrapNodeLifecycle = (Node) => {
    const previousOnNodeCreated = Node.prototype.onNodeCreated
    Node.prototype.onNodeCreated = function () {
        ensureNumberInputProperties(this)
        ensureBooleanInputProperties(this)
        if (previousOnNodeCreated) {
            previousOnNodeCreated.call(this)
        }
    }

    const previousOnConfigure = Node.prototype.onConfigure
    Node.prototype.onConfigure = function (info) {
        if (previousOnConfigure) {
            previousOnConfigure.call(this, info)
        }
        ensureNumberInputProperties(this)
        ensureBooleanInputProperties(this)
    }
}

const createNode = (name, ioProperties) => {
    LiteGraph.registerNodeType(name, (() => {
        let Node = ioProperties;
        Node.title = name.toString().split("/")[name.toString().split("/").length - 1];
        if (ioProperties.prototype.color && LGraphCanvas.node_colors[ioProperties.prototype.color]) {
            Node.color = LGraphCanvas.node_colors[ioProperties.prototype.color].color
            Node.bgcolor = LGraphCanvas.node_colors[ioProperties.prototype.color].bgcolor
        }
        Node.prototype.autoresize = true
        if (ioProperties.prototype.bigText) {
            Node.prototype.onDrawBackground = function (ctx) {
                if (this.flags.collapsed) {
                    return;
                }
                ctx.font = "20px 'Geist'";
                ctx.fillStyle = "#ffffff80";
                ctx.textAlign = "center";
                ctx.fillText(
                    ioProperties.prototype.bigText,
                    this.size[0] * 0.5,
                    (this.size[1] + LiteGraph.NODE_TITLE_HEIGHT) * 0.5 - 8
                );
                ctx.textAlign = "left";
            };
        }
        if (ioProperties.prototype.title_mode)
            Node.title_mode = ioProperties.prototype.title_mode
        if (ioProperties.prototype.collapsible)
            Node.collapsible = ioProperties.prototype.collapsible
        if (ioProperties.prototype.icon) 
            Node.icon = ioProperties.prototype.icon
        if (ioProperties.prototype.description)
            Node.prototype.description = ioProperties.prototype.description
        delete ioProperties.prototype.color;
        wrapNodeLifecycle(Node)
        return Node
    })());
}
