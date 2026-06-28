const {log, logColors} = require('../../log')
const {number, string, bool} = require('../../utils/inputParser')

class NodeDefinition {
  constructor() {
    this.addInput('Input', 'string');
    this.addInput('Delimiter', 'string');
    this.addProperty('Delimiter', '\n');
    this.addOutput('', 'array');
  }
}
NodeDefinition.prototype.title = 'String/Split'
NodeDefinition.prototype.description = "Splits a string by a delimiter and outputs the resulting parts as a JSON array string."
NodeDefinition.prototype.portMeta = {
	inputs: {
		Input: {"description":"Input \"Input\" for Split.","structure":"Plain text string (UTF-8).","required":true},
		Delimiter: {"description":"Input \"Delimiter\" for Split.","structure":"Plain text string (UTF-8).","required":true},
	},
	outputs: {
		"": {"description":"Primary output of Split.","structure":"JSON array (may be serialized as a string in some nodes).","mcpKey":"output_0"},
	},
}
NodeDefinition.prototype.color = 'green'
NodeDefinition.prototype.icon = "call_split"
const NodeFunction = async (node, params, behaviors) => {
  const chars = string(params.Input)
  const delim = string(params.Delimiter)
  await behaviors.populateNextNodeLinks([JSON.stringify(chars.split(delim))]);
  return true
}

module.exports = { NodeDefinition, NodeFunction }