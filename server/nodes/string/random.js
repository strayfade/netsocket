const { log, logColors } = require('../../log')
const { number, string, bool } = require('../../utils/inputParser')

const CHARSET_PRESETS = {
  Alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  Numeric: '0123456789',
  Lowercase: 'abcdefghijklmnopqrstuvwxyz',
  Uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  Hex: '0123456789abcdef',
}

class NodeDefinition {
  constructor() {
    this.addInput('Length', 'number');
    this.addInput('Charset', 'string');
    this.addEnumProperty('Charset', 'Alphanumeric', [
      'Alphanumeric',
      'Numeric',
      'Lowercase',
      'Uppercase',
      'Hex',
    ]);
    this.addOutput('', 'string');
  }
}
NodeDefinition.prototype.title = 'String/Random'
NodeDefinition.prototype.description = "Generates a cryptographically random string of a given length from a preset or custom character set."
NodeDefinition.prototype.color = 'green'
NodeDefinition.prototype.icon = "casino"
const crypto = require('crypto')
const NodeFunction = async (node, params, behaviors) => {
  const preset = string(params.Charset)
  const chars = CHARSET_PRESETS[preset] || preset
  let result = '';
  for (let i = 0; i < number(params.Length); i++) {
    result += chars.charAt(crypto.randomInt(chars.length));
  }
  await behaviors.populateNextNodeLinks([result]);
  return true
}

module.exports = { NodeDefinition, NodeFunction }