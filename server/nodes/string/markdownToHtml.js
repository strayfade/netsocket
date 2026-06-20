const { string } = require('../../utils/inputParser')
const { markdownToHtml } = require('../../utils/stringTools')

class NodeDefinition {
    constructor() {
        this.addInput("Markdown", "string");
        this.addProperty("Markdown", "# Hello\n\nThis is **bold**.");
        this.addOutput("HTML", "string");
    }
}
NodeDefinition.prototype.title = "String/Markdown To HTML"
NodeDefinition.prototype.description = "Converts Markdown text into HTML markup."
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "markdown"

const NodeFunction = async (node, params, behaviors) => {
    const html = markdownToHtml(string(params.Markdown))
    await behaviors.populateNextNodeLinks([html]);
    return true
}

module.exports = { NodeDefinition, NodeFunction }
