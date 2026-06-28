const { json, string } = require('../../utils/inputParser')
const { serializeCsv } = require('../../utils/jsonTools')

class NodeDefinition {
    constructor() {
        this.addInput("Rows", "object");
        this.addProperty("Rows", "[]");
        this.addInput("Columns", "string");
        this.addProperty("Columns", "");
        this.addOutput("CSV", "string");
    }
}
NodeDefinition.prototype.title = "JSON/CSV Serialize"
NodeDefinition.prototype.description = "Converts an array of objects into CSV text, using an optional comma-separated column list to control field order."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Rows: {"description":"Input \"Rows\" for CSV Serialize.","structure":"JSON object; may be returned as a parsed object or JSON string depending on the node.","required":false},
		Columns: {"description":"Input \"Columns\" for CSV Serialize.","structure":"Plain text string (UTF-8).","required":true},
	},
	outputs: {
		CSV: {"description":"CSV produced by CSV Serialize.","structure":"Plain text string (UTF-8).","mcpKey":"CSV"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "table"

const NodeFunction = async (node, params, behaviors) => {
    const rows = json(params.Rows)
    const source = Array.isArray(rows) ? rows : []
    const columnsText = string(params.Columns)
    const columns = columnsText
        ? columnsText.split(',').map((part) => part.trim()).filter(Boolean)
        : []
    const csv = serializeCsv(source, columns.length > 0 ? columns : undefined)
    await behaviors.populateNextNodeLinks([csv]);
    return true
}

module.exports = { NodeDefinition, NodeFunction }
