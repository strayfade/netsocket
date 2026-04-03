const { log, logColors } = require('../../log')

class NodeDefinition {
    constructor() {
        this.addOutput("", LiteGraph.EVENT);
        this.clicked = false;
        this.desc = "Triggers an event";
    }
}
NodeDefinition.prototype.title = "Triggers/Button"
NodeDefinition.prototype.color = "black"
NodeDefinition.prototype.icon = "ads_click"
NodeDefinition.prototype.onDrawForeground = function (ctx) {
    if (canvas.selected_nodes[this.id]) {
        return;
    }
    if (this.flags.collapsed) {
        return;
    }
    let originalFillStyle = ctx.fillStyle
    let originalStrokeStyle = ctx.strokeStyle
    ctx.fillStyle = this.clicked
        ? "white"
        : this.mouseOver
            ? "#666"
            : "#777";
    ctx.roundRect(
        0,
        0,
        this.size[0] + 1,
        this.size[1],
        [0, 0, 8, 8]
    );
    ctx.fill()
    ctx.fillStyle = originalFillStyle
    ctx.strokeStyle = originalStrokeStyle
};
NodeDefinition.prototype.onMouseDown = function (e, local_pos) {
    if (this.flags.collapsed) {
        return;
    }
    if (
        local_pos[0] > 0 &&
        local_pos[1] > 0 &&
        local_pos[0] < this.size[0] &&
        local_pos[1] < this.size[1]
    ) {
        this.clicked = true;
        if (activeWs.readyState == WebSocket.OPEN)
            activeWs.send(JSON.stringify({
                broadcastPurpose: 'execute',
                broadcastData: {
                    graphNodes: graph.serialize(),
                    node: graph.serialize().nodes.find(node => node.pos == this.pos)
                }
            }));
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