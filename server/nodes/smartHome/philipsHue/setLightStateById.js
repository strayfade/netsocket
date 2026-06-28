const { log, logColors } = require('../../../log')
const { number, string, bool } = require('../../../utils/inputParser')
const { getHueApi, LightState, hueApiLib, doesHueApiWork } = require('../../../utils/hueApi')
const { hexToRgb } = require('../../../utils/hexToRgb')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("ID", "string");
        this.addInput("Color (hex)", "string");
        this.addOutput("", LiteGraph.EVENT);
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Lights/Set Light State by ID"
NodeDefinition.prototype.description = "Turns a Philips Hue light on with an RGB color from a hex value, or off if the color is black. Controls the light via the Hue bridge API."
NodeDefinition.prototype.portMeta = {
	inputs: {
		"": {"description":"Execution trigger for graph flows; not supplied in standalone MCP calls.","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
		ID: {"description":"Unique ID of the target resource.","structure":"Resource identifier string.","required":true},
		"Color (hex)": {"description":"Target light color in hex notation.","structure":"Hex color code such as #ff0000; use #000000 or black to turn a Hue light off.","required":true},
	},
	outputs: {
		"": {"description":"Event fired when the node completes (graph flows only).","structure":"Flow-control event port; omit from execute_node.inputs — standalone MCP calls run the node directly.","mcpOmit":true},
	},
}
NodeDefinition.prototype.mcpPreferred = "Prefer for setting Hue light color or on/off: accepts a light ID and hex color (e.g. #ff0000). Use instead of Set Light State (requires JSON state) unless raw Hue API fields are needed."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"
const NodeFunction = async (node, params, behaviors) => {
    if (!doesHueApiWork()) {
        await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
        return false;
    }
    const hexVal = hexToRgb(string(params["Color (hex)"]));
    if (hexVal[0] <= 0 && hexVal[1] <= 0 && hexVal[2] <= 0)
        await getHueApi().lights.setLightState(string(params.ID), new LightState().off());
    else
        await getHueApi().lights.setLightState(string(params.ID), new LightState().on().rgb(hexVal));
    await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
    return true
}
module.exports = { NodeDefinition, NodeFunction }