const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')
const bcrypt = require('bcrypt')

class NodeDefinition {
    constructor() {
        this.addInput("Data", "string");
        this.addInput("Salt", "string");
        this.addOutput("Text", "string");
    }
}
NodeDefinition.prototype.title = "Hash/bcrypt"
NodeDefinition.prototype.description = "Hashes input data with bcrypt using the provided salt and outputs the resulting hash string."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Data: {"description":"Input \"Data\" for bcrypt.","structure":"Plain text string (UTF-8).","required":true},
		Salt: {"description":"Input \"Salt\" for bcrypt.","structure":"Plain text string (UTF-8).","required":true},
	},
	outputs: {
		Text: {"description":"Text produced by bcrypt.","structure":"Plain text string (UTF-8).","mcpKey":"Text"},
	},
}
NodeDefinition.prototype.color = "green"
NodeDefinition.prototype.icon = "tag"
const NodeFunction = async (node, params, behaviors) => {
    try  {
        await behaviors.populateNextNodeLinks([ await bcrypt.hash(string(params.Data), string(params.Salt)) ]);
        return true
    }
    catch (e) {
        log(`Error in bcrypt: ${e}`, logColors.Error)
        return false
    }
}
module.exports = { NodeDefinition, NodeFunction }