const { log, logColors } = require('../../../log')
const { number, string, bool } = require('../../../utils/inputParser')
const { getHueApi, LightState, hueApiLib, doesHueApiWork } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("ID", "string");
        this.addOutput("State Object", "string");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Get Light State by ID"
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"
const NodeFunction = async (node, params, behaviors) => {
    if (!doesHueApiWork()) {
        await behaviors.populateNextNodeLinks([JSON.stringify({})]);
        return false;
    }
    let state = await getHueApi()?.lights?.getLightState(string(params.ID))
    await behaviors.populateNextNodeLinks([JSON.stringify(state)]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }