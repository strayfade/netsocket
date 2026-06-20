const { log, logColors } = require('../../../log')
const { number, string, bool } = require('../../../utils/inputParser')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Name", "string");
        this.addProperty("Name", "Outlet");
        this.addInput("Id", "number");
        this.addProperty("Id", "2");
        this.addInput("Command", "string");
        this.addEnumProperty("Command", "On", ["On", "Off"]);
        this.addOutput("", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Smart Home/Netsocket/Send Command"
NodeDefinition.prototype.description = "Sends an On or Off command to a Netsocket device identified by name and ID. Controls local smart home hardware."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "code"
const { getDevices, discoverWirelessAdapters, sendCommand } = require('../../../utils/netsocketSmartHome')
const NodeFunction = async (node, params, behaviors) => {
    
    sendCommand(`${string(params.Name)}:${number(params.Id).toString()}:${string(params.Command)}`);

    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }