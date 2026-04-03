const {log, logColors} = require('../log')
const {number, string, bool} = require('../utils/inputParser')

class NodeDefinition {
  constructor() {
    this.addInput('Input', 'string');
    this.addInput('Delimiter', 'string');
    this.addProperty('Delimiter', '\n');
    this.addOutput('', 'array');
  }
}
NodeDefinition.prototype.title = 'String/Split'
NodeDefinition.prototype.color = 'green'
NodeDefinition.prototype.icon = "call_split"
const NodeFunction = async (node, params, behaviors) => {
  const chars = string(params.Input)
  const delim = string(params.Delimiter)
  await behaviors.populateNextNodeLinks([JSON.stringify(chars.split(delim))]);
  return true
}

module.exports = { NodeDefinition, NodeFunction }