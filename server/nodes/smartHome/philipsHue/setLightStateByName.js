const { log, logColors } = require('../../../log')
const { number, string, bool } = require('../../../utils/inputParser')
const { getHueApi, LightState, hueApiLib, doesHueApiWork } = require('../../../utils/hueApi')
const { hexToRgb } = require('../../../utils/hexToRgb')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Name", "string");
        this.addInput("Color (hex)", "string");
        this.addOutput("", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Lights/Set Light State by Name"
NodeDefinition.prototype.description = "Finds a Philips Hue light by name and sets it on with an RGB hex color or off if black. Controls the light via the Hue bridge API."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		Name: {"description":"Resource name to look up or update.","structure":"Human-readable name string.","required":true},
		"Color (hex)": {"description":"Target light color in hex notation.","structure":"Hex color code such as #ff0000; use #000000 or black to turn a Hue light off.","required":true},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
	},
}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"
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