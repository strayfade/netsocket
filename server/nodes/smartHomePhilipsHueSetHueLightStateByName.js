const { log, logColors } = require('../log')
const { number, string, bool } = require('./utils/inputParser')
const { getHueApi, LightState, hueApiLib, doesHueApiWork } = require('./utils/hueApi')
const { hexToRgb } = require('./utils/hexToRgb')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Name", "string");
        this.addInput("Color (hex)", "string");
        this.addOutput("", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Set Light State by Name"
NodeDefinition.prototype.color = "white"
const NodeFunction = async (node, params, behaviors) => {
    if (!doesHueApiWork()) {
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
        return false;
    }
    const hexVal = hexToRgb(string(params["Color (hex)"]));
    let light = await getHueApi()?.lights?.getLightByName(string(params.Name))
    if (light[0].data.id) {
        if (hexVal[0] <= 0 && hexVal[1] <= 0 && hexVal[2] <= 0)
            await getHueApi().lights.setLightState(light[0].data.id, new LightState().off());
        else
            await getHueApi().lights.setLightState(light[0].data.id, new LightState().on().rgb(hexVal));
    }
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }