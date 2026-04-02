const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addOutput("Devices", "array");
    }
}
NodeDefinition.prototype.title = "Smart Home/Netsocket/List Devices"
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "devices"
const { getDevices, discoverWirelessAdapters, sendCommand } = require('./utils/netsocketSmartHome')
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([JSON.stringify(await getDevices())]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }