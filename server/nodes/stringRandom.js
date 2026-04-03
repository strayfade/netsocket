const { log, logColors } = require('../log')
const { number, string, bool } = require('../utils/inputParser')

class NodeDefinition {
  constructor() {
    this.addInput('Length', 'number');
    this.addInput('Charset', 'string');
    this.addProperty('Charset', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
    this.addOutput('', 'string');
  }
}
NodeDefinition.prototype.title = 'String/Random'
NodeDefinition.prototype.color = 'green'
NodeDefinition.prototype.icon = "casino"
const crypto = require('crypto')
const NodeFunction = async (node, params, behaviors) => {
  const chars = string(params.Charset)
  let result = '';
  for (let i = 0; i < number(params.Length); i++) {
    result += chars.charAt(crypto.randomInt(chars.length));
  }
  await behaviors.populateNextNodeLinks([result]);
  return true
}

module.exports = { NodeDefinition, NodeFunction }