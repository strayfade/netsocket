const { string, bool } = require('../../utils/inputParser')
const { parseCsv } = require('../../utils/jsonTools')

class NodeDefinition {
    constructor() {
        this.addInput("CSV", "string");
        this.addProperty("CSV", "name,score\nAlice,10");
        this.addInput("Has Header", "boolean");
        this.addEnumProperty("Has Header", "True", ["True", "False"]);
        this.addOutput("Rows", "object");
    }
}
NodeDefinition.prototype.title = "JSON/CSV Parse"
NodeDefinition.prototype.description = "Parses CSV text into an array of row objects, optionally treating the first row as column headers."
NodeDefinition.prototype.portMeta = {
	inputs: {
		CSV: {"description":"Input \"CSV\" for CSV Parse.","structure":"Plain text string (UTF-8).","required":false},
		"Has Header": {"description":"Input \"Has Header\" for CSV Parse.","structure":"Boolean true or false.","required":false},
	},
	outputs: {
		Rows: {"description":"Rows produced by CSV Parse.","structure":"JSON object; may be returned as a parsed object or JSON string depending on the node.","mcpKey":"Rows"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "table"

const NodeFunction = async (node, params, behaviors) => {
    const rows = parseCsv(string(params.CSV), bool(params["Has Header"]))
    await behaviors.populateNextNodeLinks([rows]);
    return true
}

module.exports = { NodeDefinition, NodeFunction }
