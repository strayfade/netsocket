const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Started", "boolean");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Sensors/Search for New Sensors"
NodeDefinition.prototype.description = "Starts a bridge search for new sensors."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueWrite(behaviors, async (api, behaviors) => {
        const started = await api.sensors.searchForNew()
        await behaviors.populateNextNodeLinks([started])
    })
}

module.exports = { NodeDefinition, NodeFunction }
