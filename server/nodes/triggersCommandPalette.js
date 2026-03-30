const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')
require('../manager/nodePreferencesRegistry').addPref(
    'Command Palette',
    'cmdPalette.secret',
    'Secret Key',
    'text',
    '',
    'A secret key used to authenticate connections from the command palette to netsocket.'
);
class NodeDefinition {
    constructor() {
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Content", "string")
    }
}
NodeDefinition.prototype.title = "Triggers/Command Palette"
NodeDefinition.prototype.color = "black"
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([
        null,
        string(params["Content"])
    ]);
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }