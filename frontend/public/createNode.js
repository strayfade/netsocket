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
                ctx.font = "40px 'Google Sans Code'";
                ctx.fillStyle = "#777";
                ctx.textAlign = "center";
                ctx.fillText(
                    ioProperties.prototype.bigText,
                    this.size[0] * 0.5,
                    (this.size[1] + LiteGraph.NODE_TITLE_HEIGHT) * 0.5
                );
                ctx.textAlign = "left";
            };
        }
        delete ioProperties.prototype.color;
        return Node
    })());
}