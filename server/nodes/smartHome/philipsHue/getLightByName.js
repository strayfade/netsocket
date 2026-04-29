const { log, logColors } = require('../../../log')
const { number, string, bool } = require('../../../utils/inputParser')
const { getHueApi, LightState, hueApiLib, doesHueApiWork } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("Name", "string");
        this.addProperty("Name", "Hue bloom 1");
        this.addOutput("Light Object", "object");
        this.addOutput("ID", "string");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Get Light by Name"
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"
const NodeFunction = async (node, params, behaviors) => {
    if (!doesHueApiWork()) {
        await behaviors.populateNextNodeLinks([{}, ""]);
        return false;
    }
    let light = await getHueApi()?.lights?.getLightByName(string(params.Name))
    await behaviors.populateNextNodeLinks([light, light[0].data.id]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }