const { log, logColors } = require('../../../log')
const { number, string, bool } = require('../../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addOutput("Devices", "array");
    }
}
NodeDefinition.prototype.title = "Smart Home/Netsocket/List Devices"
NodeDefinition.prototype.description = "Queries the Netsocket smart home integration and returns the list of discovered devices as a JSON array string."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "devices"
const { getDevices, discoverWirelessAdapters, sendCommand } = require('../../../utils/netsocketSmartHome')
const NodeFunction = async (node, params, behaviors) => {
    await behaviors.populateNextNodeLinks([JSON.stringify(await getDevices())]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }