const { log, logColors } = require('../../log')

class NodeDefinition {
    constructor() {
        this.addOutput("", LiteGraph.EVENT);
        this.clicked = false;
        this.buttonHovered = false;
        this.desc = "Triggers an event";
    }
}
NodeDefinition.prototype.title = "Triggers/Button"
NodeDefinition.prototype.description = "Starts a graph run when clicked in the editor UI. Acts as a manual trigger with no inputs."
NodeDefinition.prototype.portMeta = {
	inputs: {

	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
	},
}
NodeDefinition.prototype.color = "black"
NodeDefinition.prototype.icon = "ads_click"
NodeDefinition.prototype.redraw_on_mouse = true
NodeDefinition.prototype.buttonPadding = 10
NodeDefinition.prototype.buttonHeight = 32
NodeDefinition.prototype.buttonMaxWidth = 120

NodeDefinition.prototype.getButtonLayout = function () {
    const slotRows = Math.max(
        (this.inputs && this.inputs.length) || 0,
        (this.outputs && this.outputs.length) || 0,
        1
    )
    const slotArea = (this.constructor.slot_start_y || 0) + slotRows * LiteGraph.NODE_SLOT_HEIGHT
    const h = this.buttonHeight
    const w = Math.min(this.size[0] - this.buttonPadding * 2, this.buttonMaxWidth)
    const requiredBodyHeight = Math.max(slotArea, h + this.buttonPadding * 2)
    const top = (this.size[1] - h) / 2
    return { top, w, h, requiredBodyHeight }
}

NodeDefinition.prototype.getButtonBounds = function () {
    const layout = this.getButtonLayout()
    return {
        x: (this.size[0] - layout.w) / 2,
        y: layout.top,
        w: layout.w,
        h: layout.h,
    }
}

NodeDefinition.prototype.isInsideButton = function (local_pos) {
    const b = this.getButtonBounds()
    return (
        local_pos[0] >= b.x &&
        local_pos[0] <= b.x + b.w &&
        local_pos[1] >= b.y &&
        local_pos[1] <= b.y + b.h
    )
}

NodeDefinition.prototype.ensureButtonSize = function () {
    const layout = this.getButtonLayout()
    const computed = this.computeSize()
    const requiredHeight = layout.requiredBodyHeight + 6
    this.size[0] = Math.max(this.size[0], computed[0])
    this.size[1] = Math.max(this.size[1], requiredHeight)
}

NodeDefinition.prototype.onNodeCreated = function () {
    this.ensureButtonSize()
}

NodeDefinition.prototype.onConfigure = function () {
    this.ensureButtonSize()
}

NodeDefinition.prototype.onDrawForeground = function (ctx) {
    if (this.flags.collapsed) {
        return;
    }
    const layout = this.getButtonLayout()
    if (this.size[1] < layout.requiredBodyHeight + 6) {
        this.ensureButtonSize()
    }
    const b = this.getButtonBounds()
    const hovered = this.buttonHovered
    const originalFillStyle = ctx.fillStyle
    const originalStrokeStyle = ctx.strokeStyle
    const originalTextAlign = ctx.textAlign
    const originalTextBaseline = ctx.textBaseline
    const originalFont = ctx.font

    ctx.fillStyle = this.clicked
        ? "#ddd"
        : hovered
            ? "#666"
            : "#777"
    ctx.beginPath()
    ctx.roundRect(b.x, b.y, b.w, b.h, [4])
    ctx.fill()

    ctx.strokeStyle = this.clicked ? "#aaa" : "#555"
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.fillStyle = this.clicked ? "#222" : "#eee"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.font = Math.max(11, Math.floor(b.h * 0.42)) + "px 'Geist'"
    ctx.fillText("Run", b.x + b.w * 0.5, b.y + b.h * 0.5)

    ctx.fillStyle = originalFillStyle
    ctx.strokeStyle = originalStrokeStyle
    ctx.textAlign = originalTextAlign
    ctx.textBaseline = originalTextBaseline
    ctx.font = originalFont
};
NodeDefinition.prototype.onMouseMove = function (e, local_pos) {
    if (this.flags.collapsed) {
        return;
    }
    const hovered = this.isInsideButton(local_pos)
    if (hovered !== this.buttonHovered) {
        this.buttonHovered = hovered
    }
}
NodeDefinition.prototype.onMouseLeave = function () {
    this.buttonHovered = false
    this.clicked = false
}
NodeDefinition.prototype.onMouseDown = function (e, local_pos, graphcanvas) {
    if (this.flags.collapsed) {
        return;
    }
    if (this.isInsideButton(local_pos)) {
        this.clicked = true;
        if (activeWs.readyState == WebSocket.OPEN)
            activeWs.send(JSON.stringify({
                broadcastPurpose: 'execute',
                broadcastData: {
                    graphNodes: graph.serialize(),
                    node: graph.serialize().nodes.find(node => node.pos == this.pos)
                }
            }));
        setTimeout(() => {
            if (graphcanvas && graphcanvas.selected_nodes[this.id]) {
                graphcanvas.deselectNode(this);
            }
        }, 0);
        return true;
    }
};
NodeDefinition.prototype.onExecute = function () {
    this.setOutputData(1, this.clicked);
};
NodeDefinition.prototype.onMouseUp = function (e) {
    this.clicked = false;
};
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }