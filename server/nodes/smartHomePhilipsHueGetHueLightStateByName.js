const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')
const { getHueApi, LightState, hueApiLib, doesHueApiWork } = require('./utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("Name", "string");
        this.addProperty("Name", "Hue bloom 1");
        this.addOutput("State Object", "string");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Get Light State by Name"
NodeDefinition.prototype.color = "white"
const NodeFunction = async (node, params, behaviors) => {
    if (!doesHueApiWork()) {
        await behaviors.populateNextNodeLinks([JSON.stringify({})]);
        return false;
    }
    let light = await getHueApi()?.lights?.getLightByName(string(params.Name))
    let state = await getHueApi()?.lights?.getLightState(light[0].data.id)
    await behaviors.populateNextNodeLinks([JSON.stringify(state)]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }