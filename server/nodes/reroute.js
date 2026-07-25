class NodeDefinition {
    constructor() {
        this.addInput("", "*");
        this.addOutput("", "*");
        this.size = [24, 24];
        this.resizable = false;
        this.shape = "circle";
    }
}

NodeDefinition.prototype.title = "Reroute"
NodeDefinition.prototype.description = "Organizational passthrough. Adopts the type and color of whatever is connected, then forwards that value (or event) to downstream nodes."
NodeDefinition.prototype.portMeta = {
    inputs: {
        "": {
            description: "Untyped pin that adopts the connected link's type.",
            structure: "Any data or event type; color and type match the connected link.",
        },
    },
    outputs: {
        "": {
            description: "Same value/event as the input, for cleaner graph routing.",
            structure: "Mirrors the adopted input type.",
            mcpKey: "output_0",
        },
    },
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.title_mode = "LiteGraph.NO_TITLE"
NodeDefinition.prototype.collapsible = "false"
NodeDefinition.prototype.hide_chrome = true

NodeDefinition.prototype.computeSize = function () {
    return [24, 24]
}

/** Stack both pins at the node center (input underneath, output on top when drawn). */
NodeDefinition.prototype.getConnectionPos = function (is_input, slot_number, out) {
    out = out || new Float32Array(2)
    out[0] = this.pos[0] + this.size[0] * 0.5
    out[1] = this.pos[1] + this.size[1] * 0.5
    return out
}

/**
 * Input (bottom) is interactive until connected.
 * Output (top) becomes click-and-draggable only after the input has a link.
 */
NodeDefinition.prototype.isSlotInteractive = function (is_input, slot) {
    const inputConnected = !!(this.inputs && this.inputs[0] && this.inputs[0].link != null)
    if (is_input) {
        return !inputConnected
    }
    return inputConnected
}

NodeDefinition.prototype.isPointInside = function (x, y, margin) {
    margin = margin || 0
    const radius = Math.max(this.size[0], this.size[1]) * 0.5 + margin + 6
    const cx = this.pos[0] + this.size[0] * 0.5
    const cy = this.pos[1] + this.size[1] * 0.5
    const dx = x - cx
    const dy = y - cy
    return dx * dx + dy * dy <= radius * radius
}

NodeDefinition.prototype.onConnectionsChange = function (direction, slot, connected, link_info) {
    if (!this.graph) {
        return
    }

    // Prevent re-entrant updates while cascading through chained reroutes.
    const isRootWave = !this.graph.__rerouteWave
    if (isRootWave) {
        this.graph.__rerouteWave = new Set()
    }
    if (this.graph.__rerouteWave.has(this.id)) {
        return
    }
    this.graph.__rerouteWave.add(this.id)

    try {
        const isWildcardType = function (type) {
            return type == null || type === "" || type === "*" || type === 0
        }
        const isRerouteNode = function (node) {
            return node && node.type === "Reroute"
        }

        // Reject conflicting output types when multiple concrete types are attached.
        if (connected && direction === LiteGraph.OUTPUT && this.outputs && this.outputs[0]) {
            const concreteTypes = new Set()
            for (const linkId of this.outputs[0].links || []) {
                const link = this.graph.links[linkId]
                if (!link || isWildcardType(link.type)) {
                    continue
                }
                concreteTypes.add(link.type)
            }
            if (concreteTypes.size > 1) {
                const links = (this.outputs[0].links || [])
                    .map((id) => this.graph.links[id])
                    .filter(Boolean)
                for (let i = 0; i < links.length - 1; i++) {
                    const target = this.graph.getNodeById(links[i].target_id)
                    if (target) {
                        target.disconnectInput(links[i].target_slot)
                    }
                }
            }
        }

        // Walk upstream through chained reroutes to find the root type.
        let inputType = null
        let current = this
        const seen = new Set()
        while (current && !seen.has(current.id)) {
            seen.add(current.id)
            const linkId = current.inputs && current.inputs[0] ? current.inputs[0].link : null
            if (linkId == null) {
                break
            }
            const link = this.graph.links[linkId]
            if (!link) {
                break
            }
            const origin = this.graph.getNodeById(link.origin_id)
            if (!origin) {
                break
            }
            if (isRerouteNode(origin)) {
                current = origin
                continue
            }
            const originSlot = origin.outputs && origin.outputs[link.origin_slot]
            inputType = originSlot ? originSlot.type : null
            break
        }

        // If nothing upstream, infer type from the first concrete downstream input.
        let outputType = null
        if (isWildcardType(inputType) && this.outputs && this.outputs[0] && this.outputs[0].links) {
            for (const linkId of this.outputs[0].links) {
                const link = this.graph.links[linkId]
                if (!link) {
                    continue
                }
                const target = this.graph.getNodeById(link.target_id)
                if (!target || !target.inputs || isRerouteNode(target)) {
                    continue
                }
                const targetSlot = target.inputs[link.target_slot]
                if (targetSlot && !isWildcardType(targetSlot.type)) {
                    outputType = targetSlot.type
                    break
                }
            }
        }

        const adopted = !isWildcardType(inputType)
            ? inputType
            : (!isWildcardType(outputType) ? outputType : "*")

        if (this.inputs && this.inputs[0]) {
            this.inputs[0].type = adopted
        }
        if (this.outputs && this.outputs[0]) {
            this.outputs[0].type = adopted
        }

        const syncLink = function (linkId) {
            const link = this.graph.links[linkId]
            if (link) {
                link.type = adopted
            }
        }.bind(this)

        if (this.inputs && this.inputs[0] && this.inputs[0].link != null) {
            syncLink(this.inputs[0].link)
        }
        if (this.outputs && this.outputs[0] && this.outputs[0].links) {
            for (const linkId of this.outputs[0].links) {
                syncLink(linkId)
            }
        }

        // Cascade type updates to immediately chained reroute nodes.
        if (this.outputs && this.outputs[0] && this.outputs[0].links) {
            for (const linkId of this.outputs[0].links) {
                const link = this.graph.links[linkId]
                if (!link) {
                    continue
                }
                const target = this.graph.getNodeById(link.target_id)
                if (isRerouteNode(target) && target !== this && target.onConnectionsChange) {
                    target.onConnectionsChange(LiteGraph.INPUT, 0, true, link, target.inputs[0])
                }
            }
        }

        this.setDirtyCanvas(true, true)
    } finally {
        if (isRootWave) {
            delete this.graph.__rerouteWave
        }
    }
}

const NodeFunction = async (properties, params, behaviors) => {
    const value = Object.prototype.hasOwnProperty.call(params, "")
        ? params[""]
        : null
    await behaviors.populateNextNodeLinks([value])
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0] || [])
    return true
}

module.exports = { NodeDefinition, NodeFunction }
